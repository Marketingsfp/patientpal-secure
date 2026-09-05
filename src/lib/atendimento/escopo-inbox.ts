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
export type EscopoInbox = "minhas" | "nina" | "nao_atribuidas" | "fechadas" | "equipe";

/**
 * "todas" era o nome antigo da visão de supervisão. Continua aceito na
 * entrada para não quebrar telas/links antigos, mas o nome oficial é
 * "equipe" (Todas da equipe).
 */
export function normalizarEscopo(valor: string | null | undefined): EscopoInbox {
  if (valor === "todas") return "equipe";
  const validos: EscopoInbox[] = ["minhas", "nina", "nao_atribuidas", "fechadas", "equipe"];
  return validos.includes(valor as EscopoInbox) ? (valor as EscopoInbox) : ESCOPO_INBOX_PADRAO;
}

/** Estados considerados "conversa encerrada" pelo filtro Fechadas. */
export const STATUS_FECHADOS = ["closed", "finished"] as const;

export const ESCOPO_INBOX_PADRAO: EscopoInbox = "minhas";

export interface ConversaEscopo {
  atribuida_user_id?: string | null;
  owner_type?: string | null;
  status?: string | null;
}

export type FiltroEscopo =
  | { tipo: "equipe" }
  | { tipo: "atribuida"; userId: string }
  | { tipo: "sem_responsavel" }
  | { tipo: "nina" }
  | { tipo: "fechadas"; userId: string | null };

/**
 * Escopo efetivo: "todas" só existe para gestor/admin da clínica. Qualquer
 * outro usuário cai de volta para "minhas conversas".
 */
export function escopoEfetivo(escopo: EscopoInbox, gestor: boolean): EscopoInbox {
  // "Equipe" é visão de supervisão: sem permissão de gestão, o usuário volta
  // para a própria Inbox. A checagem vale no backend, não só na tela.
  if (escopo === "equipe" && !gestor) return "minhas";
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
    case "equipe":
      return { tipo: "equipe" };
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

/** Conversa encerrada (resolvida/finalizada). */
export function conversaEstaFechada(conversa: ConversaEscopo): boolean {
  return STATUS_FECHADOS.includes((conversa.status ?? "") as (typeof STATUS_FECHADOS)[number]);
}

/**
 * Filtros operacionais (Minhas, Nina, Não atribuídas) mostram apenas conversas
 * em andamento; o histórico encerrado vive no filtro "Fechadas".
 */
export function escopoEscondeFechadas(escopo: EscopoInbox, gestor: boolean): boolean {
  const efetivo = escopoEfetivo(escopo, gestor);
  return (
    efetivo === "minhas" ||
    efetivo === "nina" ||
    efetivo === "nao_atribuidas" ||
    efetivo === "equipe"
  );
}

/** Mesma regra em forma pura, usada nos testes e em conferências locais. */
export function conversaVisivelNoEscopo(
  conversa: ConversaEscopo,
  args: { escopo: EscopoInbox; userId: string; gestor: boolean },
): boolean {
  const filtro = filtroEscopoInbox(args);
  if (escopoEscondeFechadas(args.escopo, args.gestor) && conversaEstaFechada(conversa)) {
    return false;
  }
  switch (filtro.tipo) {
    case "equipe":
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

/**
 * Pode este usuário ABRIR esta conversa (acesso direto por URL)?
 *
 * Gestor/supervisor vê qualquer conversa da clínica. Atendente comum vê
 * apenas o que algum filtro dele mostraria: as suas conversas (abertas ou
 * fechadas), as da Nina e as não atribuídas. Conversa ativa de outro
 * atendente fica bloqueada.
 */
export function usuarioPodeVerConversa(
  conversa: ConversaEscopo,
  args: { userId: string; gestor: boolean },
): boolean {
  if (args.gestor) return true;
  const escopos: EscopoInbox[] = ["minhas", "nina", "nao_atribuidas", "fechadas"];
  return escopos.some((escopo) =>
    conversaVisivelNoEscopo(conversa, { escopo, userId: args.userId, gestor: false }),
  );
}
