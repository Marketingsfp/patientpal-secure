/**
 * Ciclo de responsabilidade da conversa (puro, sem banco).
 *
 * Formaliza o ciclo:
 *   NINA → (handoff) → FILA_HUMANA → HUMANO → (Resolver) → RESOLVIDA → nova sessão → NINA
 *
 * Regras:
 * - Toda conversa tem exatamente UM responsável operacional derivado do banco.
 * - Visualizar/abrir uma conversa NÃO muda responsável (nada aqui depende de leitura).
 * - Conversa RESOLVIDA não tem atendimento ativo; a próxima mensagem inicia nova sessão.
 * - Enquanto houver pessoa responsável (ou fila aguardando pessoa), a Nina fica muda.
 */

export type OwnerTypeCiclo = "AI" | "HUMAN" | "NONE";

export type ConversaCiclo = {
  owner_type: OwnerTypeCiclo | string | null;
  ai_enabled?: boolean | null;
  status?: string | null;
  atribuida_user_id?: string | null;
};

/** Responsável operacional atual da conversa. */
export type Responsavel = "NINA" | "FILA_HUMANA" | "HUMANO" | "RESOLVIDA";

const STATUS_RESOLVIDOS = new Set([
  "closed",
  "finished",
  "resolved",
  "resolvida",
  "fechada",
  "encerrada",
]);

/** A conversa está encerrada (sessão sem atendimento ativo)? */
export function conversaResolvida(conv: ConversaCiclo | null | undefined): boolean {
  if (!conv) return false;
  return STATUS_RESOLVIDOS.has(String(conv.status ?? "").toLowerCase());
}

/**
 * Deriva o responsável único. Prioridade (evita estado ambíguo):
 * 1. resolvida (status encerrado vence qualquer owner_type gravado);
 * 2. humano (pessoa atribuída ou owner_type HUMAN);
 * 3. fila humana (owner_type NONE = aguardando pessoa);
 * 4. Nina.
 */
export function derivarResponsavel(conv: ConversaCiclo | null | undefined): Responsavel {
  if (!conv) return "NINA";
  if (conversaResolvida(conv)) return "RESOLVIDA";
  const owner = String(conv.owner_type ?? "").toUpperCase();
  if (conv.atribuida_user_id || owner === "HUMAN") return "HUMANO";
  if (owner === "NONE") return "FILA_HUMANA";
  return conv.ai_enabled === false ? "FILA_HUMANA" : "NINA";
}

/**
 * A Nina pode responder nesta conversa?
 * Conversa inexistente = sim (nova). Conversa resolvida = sim (nova sessão).
 * Conversa aberta com humano ou na fila humana = não.
 */
export function ninaResponde(conv: ConversaCiclo | null | undefined): boolean {
  const r = derivarResponsavel(conv);
  return r === "NINA" || r === "RESOLVIDA";
}

/** Rótulo interno para a equipe (não vai para o paciente). */
export function rotuloResponsavel(r: Responsavel): string {
  switch (r) {
    case "NINA":
      return "Nina";
    case "FILA_HUMANA":
      return "Aguardando atendente";
    case "HUMANO":
      return "Atendente";
    case "RESOLVIDA":
      return "Resolvida";
  }
}

export type PatchCiclo = {
  owner_type: OwnerTypeCiclo;
  ai_enabled: boolean;
  atribuida_user_id: string | null;
};

/** Combinações canônicas de gravação — usar sempre estas para não criar estado ambíguo. */
export const CICLO_PATCH = {
  nina: (): PatchCiclo => ({ owner_type: "AI", ai_enabled: true, atribuida_user_id: null }),
  filaHumana: (): PatchCiclo => ({
    owner_type: "NONE",
    ai_enabled: false,
    atribuida_user_id: null,
  }),
  humano: (userId: string): PatchCiclo => ({
    owner_type: "HUMAN",
    ai_enabled: false,
    atribuida_user_id: userId,
  }),
  /** Resolver: encerra a sessão; a próxima mensagem do paciente começa nova sessão com a Nina. */
  resolvida: (): PatchCiclo => ({ owner_type: "AI", ai_enabled: true, atribuida_user_id: null }),
} as const;

/**
 * Diagnóstico: aponta combinações inconsistentes gravadas no banco.
 * Não corrige nada — serve para auditoria e testes.
 */
export function inconsistenciasCiclo(conv: ConversaCiclo | null | undefined): string[] {
  if (!conv) return [];
  const problemas: string[] = [];
  const owner = String(conv.owner_type ?? "").toUpperCase();
  const resolvida = conversaResolvida(conv);
  if (!resolvida && owner === "HUMAN" && !conv.atribuida_user_id)
    problemas.push("owner HUMAN sem atendente atribuído");
  if (!resolvida && owner !== "HUMAN" && conv.atribuida_user_id)
    problemas.push("atendente atribuído sem owner HUMAN");
  if (!resolvida && owner === "AI" && conv.ai_enabled === false)
    problemas.push("owner AI com IA desligada (responsável indefinido)");
  if (!resolvida && owner === "NONE" && conv.ai_enabled === true)
    problemas.push("fila humana com IA ligada");
  if (resolvida && conv.atribuida_user_id)
    problemas.push("conversa resolvida ainda com atendente atribuído");
  return problemas;
}
