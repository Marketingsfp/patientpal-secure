import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import {
  aplicarMarcaNaAba,
  CHAVE_BLOQUEIO_DOMINIO,
  mensagemBloqueioDominio,
  resolverClinicaAcesso,
  verificarAcessoDominio,
  type AcessoDominio,
  type ClinicaAcesso,
} from "@/lib/clinica-acesso";

export interface ClinicaMembership {
  id: string;
  clinica_id: string;
  role: string;
  /**
   * Autoriza isenções e descontos com a própria senha. É permissão individual,
   * marcada na tela de Equipe, e NÃO se deduz do perfil: quase toda a equipe
   * tem perfil de administrador, que é o que dá acesso às telas
   * administrativas. Ver `@/lib/autorizacao-supervisor`.
   */
  pode_autorizar?: boolean | null;
  /** Marcação individual: cadastra horário semanal de médico e gera as vagas. */
  pode_gerir_horarios?: boolean | null;
  clinica: {
    id: string;
    nome: string;
    cidade: string | null;
    estado: string | null;
    branding?: ClinicaBranding | null;
    base_importada?: boolean | null;
  };
}

export interface ClinicaBranding {
  logo_url?: string | null;
  primary?: string | null;
  accent?: string | null;
}

interface ClinicaContextValue {
  memberships: ClinicaMembership[];
  clinicaAtual: ClinicaMembership | null;
  setClinicaAtual: (id: string) => void;
  /** "todas" representa modo agregado (todas as clínicas do usuário). */
  modoTodas: boolean;
  setModoTodas: (v: boolean) => void;
  /** IDs efetivos para queries: [clinicaAtual.id] ou todas as memberships. */
  clinicaIds: string[];
  /**
   * `true` quando a clínica atual é uma escolha firme — veio da URL (painel/
   * totem públicos), de uma seleção salva que ainda existe, ou o usuário só
   * tem uma unidade. `false` quando estamos apenas usando a primeira da lista
   * como palpite. Telas que GRAVAM em nome da unidade (totem) ou que a
   * representam numa TV devem se recusar a operar com palpite.
   */
  clinicaFixada: boolean;
  /** Endereço com "restringir acesso": unidade fixa, sem trocar nem "todas". */
  unidadeTravada?: boolean;
  branding: ClinicaBranding | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const ClinicaContext = createContext<ClinicaContextValue | undefined>(undefined);
const STORAGE_KEY = "clinica_atual_id";
const TODAS_KEY = "clinica_modo_todas";
const MEMBERSHIPS_CACHE_KEY = "clinica_memberships_cache_v1";

function isClinicaMembership(value: unknown): value is ClinicaMembership {
  const membership = value as Partial<ClinicaMembership> | null;
  return Boolean(
    membership?.id &&
    membership.clinica_id &&
    membership.role &&
    membership.clinica &&
    typeof membership.clinica.nome === "string",
  );
}

function readCachedMemberships(userId?: string): ClinicaMembership[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MEMBERSHIPS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!userId || parsed?.userId !== userId || !Array.isArray(parsed?.memberships)) return [];
    return parsed.memberships.filter(isClinicaMembership);
  } catch {
    return [];
  }
}

/**
 * Leitura e escrita defensivas do armazenamento do navegador.
 *
 * Este provider envolve TODO o app logado, e as chamadas abaixo rodam durante a
 * renderização. Em máquina com armazenamento bloqueado por política do
 * navegador, `localStorage` lança em vez de devolver vazio — e aí o sistema
 * inteiro caía na tela de erro a cada acesso, sem nada que a clínica pudesse
 * fazer. A escolha da clínica é uma preferência: perdê-la é aceitável, derrubar
 * o sistema não é.
 */
function lerPreferencia(chave: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarPreferencia(chave: string, valor: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: a escolha vale nesta sessão e não persiste */
  }
}

export function ClinicaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<ClinicaMembership[]>([]);
  const [clinicaAtualId, setClinicaAtualId] = useState<string | null>(() =>
    lerPreferencia(STORAGE_KEY),
  );
  const [modoTodas, setModoTodasState] = useState<boolean>(() => lerPreferencia(TODAS_KEY) === "1");
  const [loading, setLoading] = useState(true);

  const load = async (showLoading = memberships.length === 0) => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    const consultar = () =>
      supabase
        .from("clinica_memberships")
        .select(
          "id, clinica_id, role, pode_autorizar, pode_gerir_horarios, clinica:clinicas(id, nome, cidade, estado, branding, base_importada)",
        )
        .eq("user_id", user.id)
        .eq("ativo", true);
    let { data, error } = await consultar();
    if (error) {
      // "Permissão negada" aparece quando a sessão venceu no meio do caminho.
      // Renova a sessão e tenta uma vez; a lista já carregada fica na tela.
      await supabase.auth.refreshSession().catch(() => undefined);
      ({ data, error } = await consultar());
      if (error) {
        console.error("[clinica] falha ao carregar vínculos:", error.message);
        const { toast } = await import("sonner");
        toast.error("Não foi possível carregar suas unidades. Saia e entre novamente no sistema.", {
          id: "falha-vinculos",
        });
      }
    }
    if (!error && data) {
      const raw = (data as unknown[]).filter(isClinicaMembership);
      // A6 — Oculta unidades ainda não operacionais (base não importada
      // E sem médicos ativos), exceto para admin, que precisa enxergá-las
      // para configurar. Ex.: "CLINICA CONSULTA HOJE".
      const naoOperacionais = raw.filter(
        (m) => m.role !== "admin" && m.clinica.base_importada === false,
      );
      let next = raw;
      if (naoOperacionais.length > 0) {
        const ids = naoOperacionais.map((m) => m.clinica_id);
        const { data: medicos } = await supabase
          .from("medicos")
          .select("clinica_id")
          .in("clinica_id", ids)
          .eq("ativo", true)
          .limit(1000);
        const comMedico = new Set((medicos ?? []).map((r: { clinica_id: string }) => r.clinica_id));
        next = raw.filter((m) => {
          if (m.role === "admin") return true;
          if (m.clinica.base_importada !== false) return true;
          return comMedico.has(m.clinica_id);
        });
      }
      setMemberships(next);
      try {
        window.localStorage.setItem(
          MEMBERSHIPS_CACHE_KEY,
          JSON.stringify({ userId: user.id, memberships: next }),
        );
      } catch {
        /* ignore quota */
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user?.id) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    const cached = readCachedMemberships(user.id);
    setMemberships(cached);
    setLoading(cached.length === 0);
    void load(cached.length === 0);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id]);

  const setClinicaAtual = (id: string) => {
    setClinicaAtualId(id);
    setModoTodasState(false);
    gravarPreferencia(STORAGE_KEY, id);
    gravarPreferencia(TODAS_KEY, "0");
  };

  // Clínica do acesso (endereço próprio ou ?clinica= no login): pré-seleciona
  // a unidade UMA vez por sessão, só se o usuário já tiver vínculo com ela.
  // Sem vínculo, apenas avisa — nada além do RLS atual é liberado.
  const [acesso, setAcesso] = useState<ClinicaAcesso | null>(null);
  useEffect(() => {
    void resolverClinicaAcesso().then((c) => {
      setAcesso(c);
      aplicarMarcaNaAba(c);
    });
  }, []);
  useEffect(() => {
    if (!acesso || !user?.id || loading || memberships.length === 0) return;
    const marca = `clinica_acesso_aplicada:${user.id}:${acesso.clinica_id}`;
    try {
      if (window.sessionStorage.getItem(marca)) return;
      window.sessionStorage.setItem(marca, "1");
    } catch {
      /* sem armazenamento: aplica sem lembrar */
    }
    if (memberships.some((m) => m.clinica_id === acesso.clinica_id)) {
      setClinicaAtual(acesso.clinica_id);
    } else {
      void import("sonner").then(({ toast }) =>
        toast.warning(
          `Você não tem acesso à ${acesso.nome}. Escolha uma das suas unidades no seletor do topo.`,
          { id: "clinica-acesso-sem-vinculo", duration: 12000 },
        ),
      );
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [acesso, user?.id, loading, memberships]);

  // Domínio com "restringir acesso" (só endereço real, nunca ?clinica=/prévia).
  // Revalida a cada sessão e a cada recarga. Só UX: dados seguem pelo RLS.
  const [trava, setTrava] = useState<AcessoDominio | null>(null);
  const [travaVerificada, setTravaVerificada] = useState(false);
  useEffect(() => {
    if (!user?.id) {
      setTrava(null);
      setTravaVerificada(false);
      return;
    }
    let vivo = true;
    setTravaVerificada(false);
    void verificarAcessoDominio().then(async (r) => {
      if (!vivo) return;
      if (r && !r.pode) {
        try {
          window.sessionStorage.setItem(
            CHAVE_BLOQUEIO_DOMINIO,
            mensagemBloqueioDominio(r.clinica_nome ?? "clínica deste endereço"),
          );
        } catch {
          /* sem armazenamento: só não mostra a mensagem */
        }
        await supabase.auth.signOut().catch(() => undefined);
        window.location.replace("/login");
        return;
      }
      setTrava(r && r.clinica_id ? r : null);
      setTravaVerificada(true);
    });
    return () => {
      vivo = false;
    };
  }, [user?.id]);

  const travadaId = trava?.clinica_id ?? null;
  // Admin de plataforma sem vínculo: entra travado na clínica do domínio.
  // O vínculo aqui é só para a tela; o que ele vê continua decidido pelo RLS.
  const membershipsEfetivas: ClinicaMembership[] = travadaId
    ? memberships.some((m) => m.clinica_id === travadaId)
      ? memberships.filter((m) => m.clinica_id === travadaId)
      : [
          {
            id: `dominio-${travadaId}`,
            clinica_id: travadaId,
            role: "admin",
            clinica: { id: travadaId, nome: trava?.clinica_nome ?? "", cidade: null, estado: null },
          },
        ]
    : memberships;

  const setModoTodas = (v: boolean) => {
    if (travadaId) return;
    setModoTodasState(v);
    gravarPreferencia(TODAS_KEY, v ? "1" : "0");
  };

  // A escolha explícita do usuário (salva no navegador) só vale se a unidade
  // ainda estiver entre os vínculos ativos.
  const clinicaEscolhida = travadaId
    ? membershipsEfetivas[0]
    : (memberships.find((m) => m.clinica_id === clinicaAtualId) ?? null);
  const clinicaAtual = clinicaEscolhida ?? memberships[0] ?? null;
  // Quem tem uma única unidade nunca está adivinhando. Com várias, cair na
  // primeira da lista é palpite — foi assim que, depois de uma queda de
  // energia que apagou o armazenamento do navegador, um totem passou a
  // emitir senhas em nome da unidade errada.
  const clinicaFixada = clinicaEscolhida !== null || memberships.length === 1;
  const modoTodasEfetivo = travadaId ? false : modoTodas;

  const clinicaIds = modoTodasEfetivo
    ? memberships.map((m) => m.clinica_id)
    : clinicaAtual
      ? [clinicaAtual.clinica_id]
      : [];

  const branding = (clinicaAtual?.clinica.branding ?? null) as ClinicaBranding | null;
  const aguardandoTrava = !!user?.id && !travaVerificada;

  return (
    <ClinicaContext.Provider
      value={{
        memberships: membershipsEfetivas,
        clinicaAtual,
        setClinicaAtual: (id: string) => {
          if (travadaId) return;
          setClinicaAtual(id);
        },
        modoTodas: modoTodasEfetivo,
        setModoTodas,
        clinicaIds,
        clinicaFixada,
        unidadeTravada: !!travadaId,
        branding,
        loading: loading || aguardandoTrava,
        refresh: load,
      }}
    >
      {children}
    </ClinicaContext.Provider>
  );
}

export function useClinica() {
  const ctx = useContext(ClinicaContext);
  if (!ctx) throw new Error("useClinica must be used within ClinicaProvider");
  return ctx;
}
