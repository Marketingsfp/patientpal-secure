/**
 * Escopo de visibilidade da Inbox de atendimento.
 *
 * Regra principal: por padrão o atendente vê SOMENTE as conversas cujo
 * responsável atual é ele. Histórico anterior não conta — o que vale é
 * `atribuida_user_id` no momento da consulta.
 *
 * Os filtros são aplicados no backend; o frontend nunca recebe conversas de
 * outro atendente para depois escondê-las.
 */
export type EscopoInbox = "minhas" | "nina" | "nao_atribuidas" | "fechadas" | "todas";

/** Estados considerados "conversa encerrada" pelo filtro Fechadas. */
export const STATUS_FECHADOS = ["closed", "finished"] as const;

export const ESCOPO_INBOX_PADRAO: EscopoInbox = "minhas";

export interface ConversaEscopo {
  atribuida_user_id?: string | null;
  owner_type?: string | null;
  status?: string | null;
}

export type FiltroEscopo =
  | { tipo: "todas" }
  | { tipo: "atribuida"; userId: string }
  | { tipo: "sem_responsavel" }
  | { tipo: "nina" }
  | { tipo: "fechadas"; userId: string | null };

/**
 * Escopo efetivo: "todas" só existe para gestor/admin da clínica. Qualquer
 * outro usuário cai de volta para "minhas conversas".
 */
export function escopoEfetivo(escopo: EscopoInbox, gestor: boolean): EscopoInbox {
  if (escopo === "todas" && !gestor) return "minhas";
  return escopo;
}

/** Descreve o filtro que a consulta deve aplicar no banco. */
export function filtroEscopoInbox(args: {
  escopo: EscopoInbox;
  userId: string;
  gestor: boolean;
}): FiltroEscopo {
  const efetivo = escopoEfetivo(args.escopo, args.gestor);
  switch (efetivo) {
    case "todas":
      return { tipo: "todas" };
    case "nao_atribuidas":
      return { tipo: "sem_responsavel" };
    case "nina":
      return { tipo: "nina" };
    case "fechadas":
      // Gestor vê o histórico encerrado da clínica; atendente comum vê o
      // histórico das conversas que estão sob sua responsabilidade.
      return { tipo: "fechadas", userId: args.gestor ? null : args.userId };
    default:
      return { tipo: "atribuida", userId: args.userId };
  }
}

/** Mesma regra em forma pura, usada nos testes e em conferências locais. */
export function conversaVisivelNoEscopo(
  conversa: ConversaEscopo,
  args: { escopo: EscopoInbox; userId: string; gestor: boolean },
): boolean {
  const filtro = filtroEscopoInbox(args);
  switch (filtro.tipo) {
    case "todas":
      return true;
    case "sem_responsavel":
      return !conversa.atribuida_user_id && conversa.owner_type !== "AI";
    case "nina":
      return conversa.owner_type === "AI";
    case "fechadas":
      return (
        STATUS_FECHADOS.includes((conversa.status ?? "") as (typeof STATUS_FECHADOS)[number]) &&
        (filtro.userId === null || conversa.atribuida_user_id === filtro.userId)
      );
    default:
      return conversa.atribuida_user_id === filtro.userId;
  }
}
