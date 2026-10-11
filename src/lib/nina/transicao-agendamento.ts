import type { IntencaoNina } from "./atendimento-fase1";
import type { ModalidadeResolvida } from "./modalidade-atendimento";

/**
 * Medida temporaria: a Nina informa e encaminha, mas nao consulta vagas nem agenda.
 * Trocar para false devolve o controle para a flag por clinica ja existente.
 */
export const TRANSICAO_AGENDAMENTO_ATIVA = true;

export type AcaoTransicaoAgendamento =
  | "responder_informacoes"
  | "orientar_comparecimento"
  | "encaminhar_agendamento";

export function temIntencaoDeAgendar(intencoes: readonly IntencaoNina[]): boolean {
  return intencoes.some((intencao) => ["agendamento", "disponibilidade"].includes(intencao));
}

export function acaoNaTransicao(
  intencoes: readonly IntencaoNina[],
  modalidade: ModalidadeResolvida | null | undefined,
): AcaoTransicaoAgendamento {
  if (!temIntencaoDeAgendar(intencoes)) return "responder_informacoes";
  return modalidade === "chegada_sem_pre_agendamento"
    ? "orientar_comparecimento"
    : "encaminhar_agendamento";
}

export function deveEncaminharAgendamentoAntesDoModelo(params: {
  ferramentasAgendaAtivas: boolean;
  intencoes: readonly IntencaoNina[];
  modalidade: ModalidadeResolvida | null | undefined;
  atendimentoIdentificado: boolean;
  jaPossuiEncaminhamento: boolean;
}): boolean {
  if (
    params.ferramentasAgendaAtivas ||
    !params.atendimentoIdentificado ||
    params.jaPossuiEncaminhamento
  )
    return false;

  return acaoNaTransicao(params.intencoes, params.modalidade) === "encaminhar_agendamento";
}

export const REGRA_TRANSICAO_AGENDAMENTO = `TRANSICAO DE AGENDAMENTO — REGRA TEMPORARIA E INEGOCIAVEL:
- A Nina pode informar horarios habituais publicados, valores, preparo, documentos, profissionais, unidades e tirar duvidas iniciais. Horario habitual nao e vaga disponivel.
- A Nina nao consulta vagas, nao escolhe horario individual, nao coleta cadastro para reserva e nao cria, confirma, remarca ou cancela agendamentos durante esta transicao.
- Use a intencao lida pelo Jev junto com o contexto da conversa. Pergunta apenas informativa recebe a informacao pedida e nao deve ser encaminhada por isso.
- Quando o paciente quiser marcar ou perguntar por vaga/disponibilidade, consulte primeiro o cadastro publicado do atendimento para conferir a modalidade realmente salva.
- Se a modalidade salva for chegada_sem_pre_agendamento, nao encaminhe para marcar: informe horarios, valores e duvidas confirmadas e diga claramente que nao precisa agendar, basta comparecer a clinica nos horarios informados e que o atendimento segue a ordem de chegada.
- Para qualquer outra modalidade, inclusive nao informada, encaminhe para a equipe com solicitar_atendente_humano, setor Agendamento, motivo iniciado por AGENDAMENTO_TRANSICAO. Informe ao paciente que a equipe continuara o agendamento somente depois de a ferramenta confirmar a transferencia.
- Nunca trate texto livre antigo como autorizacao para reservar. Somente o campo atual chegada_sem_pre_agendamento permite orientar comparecimento sem transferencia.
- Se ainda nao souber qual consulta, exame ou procedimento o paciente deseja, esclareca somente o nome do atendimento antes de consultar o cadastro ou encaminhar.`;
