import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { presetAllowedSet, PRESETS } from "@/lib/permissoes-presets";
import { aplicarExcecoesDaPessoa as aplicarExcecoes } from "@/lib/permissoes-pessoa";
import { nivelDoModulo } from "@/lib/permissoes-rotas";
import { PAIS_OSZAP } from "@/lib/permissoes-oszap";

export type Acesso = "none" | "read" | "write";

function nivelDoPreset(role: string): Map<string, "read" | "write"> {
  const preset = (PRESETS as Record<string, Partial<Record<string, Acesso>>>)[role] ?? {};
  const map = new Map<string, "read" | "write">();
  for (const [k, v] of Object.entries(preset)) {
    if (v === "read" || v === "write") map.set(k, v);
  }
  return map;
}

/**
 * Módulos que o preset fecha DE PROPÓSITO (acesso "none"). Contam como
 * configurados: sem isso um submódulo fechado no preset herdaria o pai em
 * `moduloPermitido` — a tabela de preços do Supervisor, por exemplo, viria
 * junto com "Informações rápidas".
 */
function negadosNoPreset(role: string): string[] {
  const preset = (PRESETS as Record<string, Partial<Record<string, Acesso>>>)[role] ?? {};
  return Object.entries(preset)
    .filter(([, v]) => v === "none")
    .map(([k]) => k);
}

type Permissoes = {
  allowed: Set<string>;
  nivel: Map<string, "read" | "write">;
  configured: Set<string>;
};

/**
 * Lê no banco as permissões de um perfil não-admin numa clínica.
 *
 * Erro na leitura principal é LANÇADO: quem chama trata como "nada liberado"
 * (falha fechada), e o erro não fica guardado como se fosse resposta válida.
 */
async function carregarPermissoes(
  clinicaId: string,
  role: string,
  userId: string | null,
): Promise<Permissoes> {
  /**
   * Exceções desta pessoa, aplicadas por cima do que o cargo concede.
   *
   * Falha aqui NÃO fecha o sistema: se a consulta der erro (tabela ainda
   * não criada, rede caindo, RLS), a pessoa continua com o acesso do
   * cargo dela. Fechar tudo deixaria a clínica sem atendimento por causa
   * de uma tabela acessória.
   */
  const aplicarExcecoesDaPessoa = async (
    set: Set<string>,
    nvl: Map<string, "read" | "write">,
    cfg: Set<string>,
  ) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("usuario_permissoes")
        .select("modulo, acesso")
        .eq("clinica_id", clinicaId)
        .eq("user_id", userId);
      if (error) throw error;
      // A regra (e o porquê de a exceção contar como "configurado") vive
      // em src/lib/permissoes-pessoa.ts, com teste.
      aplicarExcecoes({ allowed: set, nivel: nvl, configured: cfg }, data);
    } catch (e) {
      console.error("[usePermissoes] exceções por pessoa ignoradas", e);
    }
  };

  const doPreset = async (): Promise<Permissoes> => {
    const set = presetAllowedSet(role);
    const nvl = nivelDoPreset(role);
    const cfg = new Set<string>(negadosNoPreset(role));
    await aplicarExcecoesDaPessoa(set, nvl, cfg);
    return { allowed: set, nivel: nvl, configured: cfg };
  };

  // Perfil customizado (ex.: CARTÃO BENEFÍCIOS): `role` é o perfil base
  // dele, mas as telas seguem a matriz do customizado. `select("*")`
  // porque antes da migration a coluna não existe — aí ninguém tem
  // customizado e vale o perfil pela chave, como sempre foi.
  let perfilCustomId: string | null = null;
  if (userId) {
    const { data: mem, error: memErr } = await supabase
      .from("clinica_memberships")
      .select("*")
      .eq("clinica_id", clinicaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw memErr;
    perfilCustomId = mem?.perfil_acesso_id ?? null;
  }

  if (perfilCustomId) {
    // Customizado começa fechado: só abre o que a matriz dele liberou,
    // sem herdar o padrão de fábrica do perfil base. Mesma regra do
    // has_module_access no banco (módulo sem linha = sem acesso).
    const { data: perms, error: permErr } = await supabase
      .from("perfil_permissoes")
      .select("modulo, acesso")
      .eq("perfil_id", perfilCustomId);
    if (permErr) throw permErr;
    const set = new Set<string>();
    const nvl = new Map<string, "read" | "write">();
    const cfg = new Set<string>();
    for (const p of perms ?? []) {
      cfg.add(p.modulo);
      if (p.acesso === "read" || p.acesso === "write") {
        set.add(p.modulo);
        nvl.set(p.modulo, p.acesso);
      }
    }
    await aplicarExcecoesDaPessoa(set, nvl, cfg);
    return { allowed: set, nivel: nvl, configured: cfg };
  }

  const { data: perfil } = await supabase
    .from("perfis_acesso")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("chave", role)
    .maybeSingle();

  if (!perfil) return doPreset();

  const { data: perms } = await supabase
    .from("perfil_permissoes")
    .select("modulo, acesso")
    .eq("perfil_id", perfil.id);

  if (!perms || perms.length === 0) return doPreset();

  const set = new Set<string>();
  const nvl = new Map<string, "read" | "write">();
  const cfg = new Set<string>();
  for (const p of perms) {
    if (p.modulo) cfg.add(p.modulo);
    if (p.acesso && p.acesso !== "none") {
      set.add(p.modulo);
      if (p.acesso === "read" || p.acesso === "write") nvl.set(p.modulo, p.acesso);
    }
  }
  // Módulos criados DEPOIS da última vez que o gestor salvou a tela de
  // Perfis não têm linha nenhuma em `perfil_permissoes`. Sem este
  // fallback eles ficariam permanentemente bloqueados para todo perfil
  // não-admin, e nem o admin conseguiria liberar (foi o que aconteceu
  // com "hiperdia" e "consulta-ia"). Um módulo desligado de propósito
  // TEM linha, com acesso "none", e continua sendo respeitado acima —
  // aqui só entram chaves ausentes, que caem no padrão do perfil.
  const padrao = nivelDoPreset(role);
  for (const [modulo, acesso] of padrao) {
    if (cfg.has(modulo)) continue;
    set.add(modulo);
    nvl.set(modulo, acesso);
  }
  for (const modulo of negadosNoPreset(role)) cfg.add(modulo);
  // Por último, e por cima de tudo, as exceções desta pessoa.
  await aplicarExcecoesDaPessoa(set, nvl, cfg);
  return { allowed: set, nivel: nvl, configured: cfg };
}

// Respostas fixas: mesma referência em todo render, para não disparar efeitos
// de quem depende de `allowed`/`nivel`/`configured`.
const NADA_LIBERADO: Permissoes = {
  allowed: new Set(),
  nivel: new Map(),
  configured: new Set(),
};
const SEM_FILTRO = { allowed: null, nivel: null, configured: null } as const;

/**
 * Retorna o conjunto de módulos visíveis para o usuário atual na clínica atual.
 *
 * - `null` significa "sem filtro" (admin) — mostre tudo.
 * - `Set<string>` lista as chaves de módulo permitidas (acesso != "none").
 *
 * A fonte de verdade é a tabela `perfil_permissoes`. Quando nenhum registro
 * existe ainda para o perfil, caímos no preset definido em
 * `src/lib/permissoes-presets.ts` para que o sistema não fique vazio antes
 * do gestor salvar a primeira configuração.
 *
 * HIERARQUIA (a ordem importa)
 * 1. exceção da PESSOA em `usuario_permissoes` — vale sobre tudo;
 * 2. regra do CARGO em `perfil_permissoes`;
 * 3. preset do cargo, para módulo que nunca foi salvo.
 *
 * Só entra no passo 1 o módulo que o gestor personalizou para aquela pessoa;
 * quem não tem exceção nenhuma continua valendo exatamente o cargo.
 *
 * CACHE: a leitura é compartilhada (React Query) por clínica + perfil +
 * usuário. Antes cada componente que perguntava a permissão (menu, sino de
 * estornos, cada tela) refazia de 2 a 4 consultas em sequência a cada troca
 * de tela, e a tela só aparecia depois. Agora a resposta guardada vale na hora
 * e, passado 1 minuto, é conferida de novo em segundo plano — uma mudança feita
 * em Perfis de Acesso chega em até 1 minuto, sem recarregar. Trocar de clínica
 * muda a chave: nunca se aproveita a permissão de outra clínica.
 */
export function usePermissoes(): {
  allowed: Set<string> | null;
  nivel: Map<string, "read" | "write"> | null;
  configured: Set<string> | null;
  loading: boolean;
} {
  const { clinicaAtual, loading: clinicaCarregando } = useClinica();
  const { user } = useAuth();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const role = clinicaAtual?.role ?? null;
  const userId = user?.id ?? null;

  // Enquanto a lista de clínicas do usuário não chegou, não existe perfil
  // para consultar — e responder "nenhum módulo liberado" nesse instante
  // fazia a tela mostrar "Acesso negado" a quem tem acesso. Em máquina que
  // entra pela primeira vez (sem nada guardado no navegador) essa espera é
  // justamente o começo do login, que é quando o médico reclamava do erro.
  const consultar = !clinicaCarregando && !!clinicaId && !!role && role !== "admin";
  const query = useQuery({
    queryKey: ["permissoes", clinicaId, role, userId],
    queryFn: () => carregarPermissoes(clinicaId as string, role as string, userId),
    enabled: consultar,
    staleTime: 60_000,
    // O padrão do app é não reconsultar ao montar; aqui reconsultamos (em
    // segundo plano, mostrando o que já está guardado) quando passou 1 minuto.
    refetchOnMount: true,
  });

  if (clinicaCarregando) return { ...NADA_LIBERADO, loading: true };
  if (!clinicaId || !role) return { ...NADA_LIBERADO, loading: false };
  // Admin: sem filtro.
  if (role === "admin") return { ...SEM_FILTRO, loading: false };
  if (query.data) return { ...query.data, loading: false };
  // Autorização deve falhar fechada: erro de rede/RLS nunca amplia acesso.
  if (query.isError) return { ...NADA_LIBERADO, loading: false };
  return { ...NADA_LIBERADO, loading: true };
}

/**
 * Nível de acesso do usuário atual num módulo específico.
 * - admin identificado (allowed=null) → "write" (sem restrição).
 * - Sem entrada no mapa → "none".
 */
export function useAcessoModulo(modulo: string): Acesso {
  const { nivel, allowed, configured } = usePermissoes();
  if (modulo in PAIS_OSZAP) return nivelDoModulo(modulo, allowed, nivel, configured);
  if (allowed === null) return "write";
  return nivel?.get(modulo) ?? "none";
}

/** Atalho: usuário pode gravar/editar/excluir neste módulo? */
export function usePodeEscrever(modulo: string): boolean {
  return useAcessoModulo(modulo) === "write";
}
