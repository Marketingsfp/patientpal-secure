/**
 * CONTEXTO CANÔNICO DO TURNO (Fase 2).
 *
 * Uma única verdade sobre "o que o paciente pediu" e "o que a Nina vai fazer".
 * O Confidence Engine e a auditoria consomem ESTE objeto — nunca cada um o seu.
 *
 * Regras inegociáveis:
 * 1. Ausência de sinal não vira certeza. Sem intenção legível, a ação é
 *    `desconhecida` e a intenção é `null` (conceitualmente UNKNOWN).
 * 2. Capacidade da clínica NÃO é intenção do paciente. `podeAgendar` significa
 *    apenas que a agenda está habilitada; nunca implica `criar_agendamento`.
 */
import type { IntencaoNina } from "../atendimento-fase1";
import type { EtapaFluxoNina } from "../fluxo-estado-normalizar";
import type { AcaoSolicitada } from "./types";
import { acaoDoTipoDeTurno, classificarTipoTurno, type TipoTurno } from "./turno-tipo";

/** Capacidades habilitadas na clínica. Nunca viram intenção. */
export type CapacidadesDoTurno = {
  /** A clínica tem ferramenta de agenda habilitada neste turno. */
  podeAgendar: boolean;
};

/**
 * FASE 5 — o turno do paciente é o LOTE inteiro (Message Burst Aggregation).
 * Três mensagens físicas seguidas formam UM turno lógico: uma intenção, uma
 * transição de estágio, uma avaliação de confiança e uma resposta.
 */
export type LoteDoTurno = {
  /** Identificador do lote (vazio quando a mensagem veio sozinha). */
  batchId: string | null;
  /** IDs reais das mensagens do paciente que formam este turno, em ordem. */
  messageIds: string[];
  /** Revisão da conversa congelada por esta geração (FASE 4). */
  conversationRevision: number | null;
};

export type ContextoCanonicoTurno = {
  /** Intenções observadas na mensagem do paciente (pode ser vazio). */
  intencoes: IntencaoNina[];
  /** Rótulo textual das intenções, ou `null` quando desconhecida (UNKNOWN). */
  intent: string | null;
  /** Onde a conversa está (máquina de estados existente). */
  stage: EtapaFluxoNina | null;
  /**
   * SOMENTE uma ação executável prestes a acontecer. Intenção NÃO basta:
   * `criar_agendamento` exige o estágio de criação; `cancelar_agendamento`
   * exige o cancelamento realmente em execução.
   */
  requestedAction: AcaoSolicitada | null;
  /** FASE 1 — natureza do turno (saudação, esclarecimento, informação...). */
  turnType: TipoTurno;
  /** A mensagem não permite decidir o que o paciente quer. */
  intentAmbiguo: boolean;
  /** Capacidades da clínica — informativo, fora da decisão de intenção. */
  capacidades: CapacidadesDoTurno;
  /** Mensagem de entrada do paciente que originou o turno. */
  messageIdEntrada: string | null;
  /** Mensagem de saída da Nina, quando já existir (vínculo da decisão). */
  messageIdResposta: string | null;
  /** FASE 5 — lote de entrada avaliado como um único turno. */
  lote: LoteDoTurno;
};

/**
 * Tradução intenção -> ação CONVERSACIONAL. A primeira que casar vence.
 * Pedir valor/horário/médico é informação, não agendamento.
 *
 * Intenções críticas (agendamento, remarcação, cancelamento) NÃO aparecem
 * aqui de propósito: elas descrevem desejo, não execução.
 */
const PRIORIDADE: Array<[IntencaoNina, AcaoSolicitada]> = [
  ["falar_humano", "transferir_humano"],
  ["disponibilidade", "informar_disponibilidade"],
  ["valor", "informar_valor"],
  ["financeiro", "informar_valor"],
  ["preparo", "informar_preparo"],
  ["documentos", "informar_regra"],
  ["horario", "informar_horario"],
  ["medico", "informar_profissional"],
];

/** Intenções que descrevem desejo de uma operação crítica, não a operação. */
const INTENCOES_CRITICAS: IntencaoNina[] = ["agendamento", "remarcacao", "cancelamento"];

/** Sinais do fluxo real que autorizam uma ação executável neste turno. */
export type GatilhosExecucao = {
  /** Estágio atual da máquina de estados do atendimento. */
  stage?: EtapaFluxoNina | null;
  /** O cancelamento está sendo executado agora (dados e confirmação prontos). */
  cancelamentoEmExecucao?: boolean;
};

/**
 * Traduz o turno em ação. Sem intenção legível devolve `desconhecida`;
 * com intenção crítica sem o estágio de execução devolve `nenhuma`.
 */
export function acaoDasIntencoes(
  intencoes: IntencaoNina[],
  gatilhos: GatilhosExecucao = {},
): AcaoSolicitada {
  if (intencoes.length === 0) return "desconhecida";

  // Pedido explícito de humano continua sendo a operação que o sistema executa.
  if (intencoes.includes("falar_humano")) return "transferir_humano";

  if (intencoes.includes("cancelamento")) {
    return gatilhos.cancelamentoEmExecucao === true ? "cancelar_agendamento" : "nenhuma";
  }
  if (intencoes.includes("agendamento") || intencoes.includes("remarcacao")) {
    return gatilhos.stage === "CREATING_APPOINTMENT" ? "criar_agendamento" : "nenhuma";
  }

  for (const [intencao, acao] of PRIORIDADE) {
    if (intencoes.includes(intencao)) return acao;
  }
  // consulta / exame / procedimento / endereco: assunto sem pedido específico.
  return "responder_informacao";
}

/**
 * O turno chegou de fato ao estágio de criação, mesmo sem intenção redetectada
 * na mensagem atual ("sim, pode confirmar" não contém a palavra agendar).
 */
function criandoAgendamento(gatilhos: GatilhosExecucao): boolean {
  return gatilhos.stage === "CREATING_APPOINTMENT";
}

export type EntradaContextoCanonico = {
  mensagemPaciente: string;
  /** Capacidade da clínica. Entra só em `capacidades`. */
  podeAgendar: boolean;
  /** Estágio real do fluxo (máquina de estados existente). */
  stage?: EtapaFluxoNina | null;
  /** Cancelamento realmente em execução neste turno. */
  cancelamentoEmExecucao?: boolean;
  messageIdEntrada?: string | null;
  messageIdResposta?: string | null;
  /** FASE 5 — lote de mensagens que compõe este turno. */
  lote?: Partial<LoteDoTurno> | null;
};

/**
 * Monta o contexto canônico do turno a partir da mensagem real do paciente.
 * Motor e auditoria recebem exatamente estes valores.
 */
export function montarContextoCanonicoTurno(
  e: EntradaContextoCanonico,
  deps: {
    detectarIntencoes: (m: string) => IntencaoNina[];
    intencaoAmbigua: (m: string, i: IntencaoNina[]) => boolean;
  },
): ContextoCanonicoTurno {
  const mensagem = e.mensagemPaciente ?? "";
  const intencoes = deps.detectarIntencoes(mensagem);
  const ambiguo = deps.intencaoAmbigua(mensagem, intencoes);
  const gatilhos: GatilhosExecucao = {
    stage: e.stage ?? null,
    cancelamentoEmExecucao: e.cancelamentoEmExecucao === true,
  };
  const acaoCalculada: AcaoSolicitada = criandoAgendamento(gatilhos)
    ? "criar_agendamento"
    : acaoDasIntencoes(intencoes, gatilhos);
  const turnType = classificarTipoTurno({
    mensagem,
    intencoes,
    acao: acaoCalculada,
    intentAmbiguo: ambiguo,
  });
  // "nenhuma ação" ≠ "ação desconhecida": a matriz de aplicabilidade depende
  // dessa distinção para não exigir fonte/ferramenta de uma saudação.
  const requestedAction = acaoDoTipoDeTurno(turnType, acaoCalculada, mensagem);

  return {
    intencoes,
    turnType,
    intent: intencoes.length > 0 ? intencoes.join(", ") : null,
    stage: e.stage ?? null,
    requestedAction,
    intentAmbiguo: ambiguo,
    capacidades: { podeAgendar: e.podeAgendar },
    messageIdEntrada: e.messageIdEntrada ?? null,
    messageIdResposta: e.messageIdResposta ?? null,
    lote: {
      batchId: e.lote?.batchId || null,
      messageIds: e.lote?.messageIds ?? (e.messageIdEntrada ? [e.messageIdEntrada] : []),
      conversationRevision: e.lote?.conversationRevision ?? null,
    },
  };
}

/** Quantas mensagens físicas do paciente originaram este turno lógico. */
export function tamanhoDoLote(c: ContextoCanonicoTurno): number {
  return c.lote.messageIds.length;
}

/** Intenção crítica presente, mas sem execução autorizada neste turno. */
export function intencaoCriticaSemExecucao(c: ContextoCanonicoTurno): boolean {
  return (
    (c.requestedAction === null || c.requestedAction === "nenhuma") &&
    c.intencoes.some((i) => INTENCOES_CRITICAS.includes(i))
  );
}
