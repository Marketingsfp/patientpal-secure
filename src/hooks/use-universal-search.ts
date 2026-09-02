import { getFlagUsuario, setFlagUsuario } from "@/lib/cache/prefs-cache";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CommandEntry } from "@/components/list-shell";
import { normalizarTermoBusca } from "@/lib/busca-texto";

export type UBTipo =
  | "paciente"
  | "orcamento"
  | "agendamento"
  | "financeiro"
  | "nfse"
  | "cartao_convenio"
  | "contrato_associado"
  | "medico"
  | "procedimento";

export interface UBRow {
  tipo: UBTipo;
  id: string;
  titulo: string;
  subtitulo: string | null;
  hint: string | null;
  payload: Record<string, unknown> | null;
  score: number;
  criado_em: string | null;
}

const GROUPS: Record<UBTipo, string> = {
  paciente: "Pacientes",
  orcamento: "Orçamentos",
  agendamento: "Agenda",
  financeiro: "Financeiro",
  nfse: "NFS-e",
  cartao_convenio: "Cartão de Benefícios",
  contrato_associado: "Associados",
  medico: "Médicos",
  procedimento: "Procedimentos",
};

const ROUTE_OF: Record<UBTipo, (r: UBRow) => string> = {
  paciente: (r) => `/app/clientes/${r.id}/editar`,
  orcamento: (r) => `/app/orcamentos?abrir=${r.id}`,
  agendamento: () => `/app/agenda`,
  financeiro: () => `/app/financeiro/movimento`,
  nfse: (r) => `/app/nfse?abrir=${r.id}`,
  cartao_convenio: () => `/app/cartao-beneficios`,
  contrato_associado: (r) => `/app/cartao-beneficios/contratos?abrir=${r.id}`,
  medico: (r) => `/app/equipe?abrir=${r.id}`,
  procedimento: (r) => `/app/procedimentos?abrir=${r.id}`,
};

/** Prefixos: p:silva (paciente), o:2024, a:, n:, c:, m:, r: (procedimento) */
function parseTerm(input: string): { termo: string; tipos?: UBTipo[] } {
  // O termo é limpo (espaço sobrando, espaço duplicado, espaço "duro" de
  // PDF/página web) antes de virar padrão LIKE no banco. Sem isso, um nome
  // colado do WhatsApp não casa com paciente nenhum.
  const limpo = normalizarTermoBusca(input);
  const m = /^([poancmr]):(.*)$/i.exec(limpo);
  if (!m) return { termo: limpo };
  const map: Record<string, UBTipo[]> = {
    p: ["paciente"],
    o: ["orcamento"],
    a: ["agendamento"],
    n: ["nfse"],
    c: ["cartao_convenio", "contrato_associado"],
    m: ["medico"],
    r: ["procedimento"],
  };
  return { termo: normalizarTermoBusca(m[2]), tipos: map[m[1].toLowerCase()] };
}

export interface UseUniversalSearchOpts {
  clinicaIds: string[];
  navigate: (to: string) => void;
  /** Permite filtrar por permissão do perfil */
  isAllowed?: (tipo: UBTipo) => boolean;
}

/** Retorna searcher assíncrono para o CommandPalette. */
export function useUniversalSearcher(opts: UseUniversalSearchOpts) {
  const { clinicaIds, navigate, isAllowed } = opts;
  const cacheRef = useRef(new Map<string, CommandEntry[]>());
  const abortRef = useRef<AbortController | null>(null);

  return async (rawTerm: string): Promise<CommandEntry[]> => {
    const { termo, tipos } = parseTerm(rawTerm);
    if (termo.length < 2 || clinicaIds.length === 0) return [];
    const cacheKey = `${termo}|${(tipos ?? []).join(",")}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) return cached;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const { data, error } = await supabase.rpc("buscar_universal", {
        _clinica_ids: clinicaIds,
        _termo: termo,
        _tipos: tipos ?? undefined,
        _limite: 24,
      });
      if (error) {
        console.error("[ub] rpc", error);
        return [];
      }
      const rows = (data ?? []) as UBRow[];
      const entries: CommandEntry[] = rows
        .filter((r) => !isAllowed || isAllowed(r.tipo))
        .map((r) => ({
          id: `ub:${r.tipo}:${r.id}`,
          label: r.titulo,
          hint: [r.subtitulo, r.hint].filter(Boolean).join(" · "),
          group: GROUPS[r.tipo],
          keywords: [r.tipo],
          onSelect: () => navigate(ROUTE_OF[r.tipo](r)),
        }));
      if (cacheRef.current.size > 30) cacheRef.current.clear();
      cacheRef.current.set(cacheKey, entries);
      return entries;
    } catch (e) {
      console.error("[ub] catch", e);
      return [];
    }
  };
}

/** Lê feature flag ub_v1 de profiles.preferencias_ui (default false). */
export function useUBFlag(): {
  enabled: boolean;
  loading: boolean;
  setEnabled: (v: boolean) => Promise<void>;
} {
  // Liberada por padrão para todos os perfis/clínicas. Só fica oculta quando
  // o usuário desliga explicitamente a flag (ub_v1 === false).
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const v = await getFlagUsuario("ub_v1");
      if (alive) {
        setEnabled(v !== false);
        setLoading(false);
      }
    })();
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ ub_v1: boolean }>;
      if (alive && ce.detail) setEnabled(Boolean(ce.detail.ub_v1));
    };
    window.addEventListener("ub:flag-changed", onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener("ub:flag-changed", onChange as EventListener);
    };
  }, []);

  const set = async (v: boolean) => {
    await setFlagUsuario("ub_v1", v);
    setEnabled(v);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ub:flag-changed", { detail: { ub_v1: v } }));
    }
  };

  return { enabled, loading, setEnabled: set };
}
