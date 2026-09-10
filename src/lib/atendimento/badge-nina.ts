/**
 * Fonte canônica dos indicadores (badges) do card de conversa do Atendimento.
 *
 * Causa raiz corrigida na FASE 1: duas condições independentes representavam o
 * MESMO conceito ("status = bot_attending" e "owner_type = AI"), renderizando
 * dois selos "✦ Nina" no mesmo card.
 *
 * Regra desta camada: cada informação semântica tem UMA representação. A lista
 * de tipos abaixo é deduplicada por chave semântica (e não por texto), de forma
 * que nenhuma tela que reutilize o card consiga produzir dois selos iguais.
 *
 * Puro e sem I/O: usa apenas dados já presentes na conversa, sem consulta nova
 * ao banco e sem custo relevante de renderização.
 */
export type ConversaIndicadores = {
  status?: string | null;
  owner_type?: string | null;
  handoff_motivo?: string | null;
  atribuida_user_id?: string | null;
};

export type BadgeConversaTipo =
  | "status"
  | "sem-responsavel"
  | "humano"
  | "nina"
  | "timeout-nina"
  | "responsavel";

/** true quando a conversa deve exibir exatamente um indicador "✦ Nina". */
export function conversaEhDaNina(c: ConversaIndicadores | null | undefined): boolean {
  if (!c) return false;
  return c.owner_type === "AI" || c.status === "bot_attending";
}

/** Alias semântico usado pela camada visual. */
export const shouldShowNinaBadge = conversaEhDaNina;

/**
 * true quando o badge de status seria apenas uma segunda representação da
 * Nina e, portanto, não deve ser renderizado junto do indicador canônico.
 */
export function statusEhRepresentacaoDaNina(status?: string | null): boolean {
  return status === "bot_attending";
}

/**
 * Tipos de badge que o card deve renderizar, já deduplicados por chave
 * semântica e em ordem estável. A Nina nunca aparece duas vezes, mesmo que
 * várias marcações internas apontem para ela.
 */
export function tiposDeBadgeDoCard(c: ConversaIndicadores | null | undefined): BadgeConversaTipo[] {
  const tipos = new Set<BadgeConversaTipo>();
  if (!c) return [];

  const nina = conversaEhDaNina(c);
  // Status só entra quando não é apenas outra forma de dizer "Nina".
  if (c.status && !(nina && statusEhRepresentacaoDaNina(c.status))) tipos.add("status");
  if (c.owner_type === "NONE") tipos.add("sem-responsavel");
  // Nina não é responsável humano: os dois conceitos têm selos distintos.
  if (c.owner_type === "HUMAN") tipos.add("humano");
  if (nina) tipos.add("nina");
  if (c.handoff_motivo === "patient_response_timeout") tipos.add("timeout-nina");
  if (c.atribuida_user_id) tipos.add("responsavel");

  const ordem: BadgeConversaTipo[] = [
    "status",
    "sem-responsavel",
    "humano",
    "nina",
    "timeout-nina",
    "responsavel",
  ];
  return ordem.filter((t) => tipos.has(t));
}
