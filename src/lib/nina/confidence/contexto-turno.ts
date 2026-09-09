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

/** Capacidades habilitadas na clínica. Nunca viram intenção. */
export type CapacidadesDoTurno = {
  /** A clínica tem ferramenta de agenda habilitada neste turno. */
  podeAgendar: boolean;
};

export type ContextoCanonicoTurno = {
  /** Intenções observadas na mensagem do paciente (pode ser vazio). */
  intencoes: IntencaoNina[];
  /** Rótulo textual das intenções, ou `null` quando desconhecida (UNKNOWN). */
  intent: string | null;
  /** O que a Nina vai fazer, derivado SÓ do que foi observado. */
  requestedAction: AcaoSolicitada;
  /** A mensagem não permite decidir o que o paciente quer. */
  intentAmbiguo: boolean;
  /** Capacidades da clínica — informativo, fora da decisão de intenção. */
  capacidades: CapacidadesDoTurno;
  /** Mensagem de entrada do paciente que originou o turno. */
  messageIdEntrada: string | null;
  /** Mensagem de saída da Nina, quando já existir (vínculo da decisão). */
  messageIdResposta: string | null;
};

/**
 * Prioridade de tradução intenção -> ação. A primeira que casar vence.
 * Pedir valor/horário/médico é informação, não agendamento.
 */
const PRIORIDADE: Array<[IntencaoNina, AcaoSolicitada]> = [
  ["falar_humano", "transferir_humano"],
  ["cancelamento", "cancelar_agendamento"],
  ["remarcacao", "criar_agendamento"],
  ["agendamento", "criar_agendamento"],
  ["disponibilidade", "informar_disponibilidade"],
  ["valor", "informar_valor"],
  ["financeiro", "informar_valor"],
  ["preparo", "informar_preparo"],
  ["documentos", "informar_regra"],
  ["horario", "informar_horario"],
  ["medico", "informar_profissional"],
];

/**
 * Traduz intenções observadas em ação. Sem intenção legível devolve
 * `desconhecida` — jamais um padrão otimista.
 */
export function acaoDasIntencoes(intencoes: IntencaoNina[]): AcaoSolicitada {
  if (intencoes.length === 0) return "desconhecida";
  for (const [intencao, acao] of PRIORIDADE) {
    if (intencoes.includes(intencao)) return acao;
  }
  // consulta / exame / procedimento / endereco: assunto sem pedido específico.
  return "responder_informacao";
}

export type EntradaContextoCanonico = {
  mensagemPaciente: string;
  /** Capacidade da clínica. Entra só em `capacidades`. */
  podeAgendar: boolean;
  messageIdEntrada?: string | null;
  messageIdResposta?: string | null;
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
  const requestedAction = acaoDasIntencoes(intencoes);

  return {
    intencoes,
    intent: intencoes.length > 0 ? intencoes.join(", ") : null,
    requestedAction,
    intentAmbiguo: ambiguo,
    capacidades: { podeAgendar: e.podeAgendar },
    messageIdEntrada: e.messageIdEntrada ?? null,
    messageIdResposta: e.messageIdResposta ?? null,
  };
}
