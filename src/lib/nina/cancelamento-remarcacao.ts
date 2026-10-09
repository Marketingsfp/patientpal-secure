import type { PerguntaJev, RespostaJev } from "./jev";

export type AlteracaoAgendamento = "cancelamento" | "remarcacao";
export const REGRA_CANCELAMENTO_REMARCACAO =
  "AGENDA-ALTERACAO-01 — A Nina não cancela nem remarca agendamentos. Quando o paciente pedir cancelamento, desmarcação ou mudança de data, horário ou profissional de um atendimento já marcado, chame imediatamente solicitar_atendente_humano, com motivo CANCELAMENTO_SOLICITADO ou REMARCACAO_SOLICITADA e resumo do pedido. Não consulte novas vagas, não selecione nem crie outra reserva para substituir a anterior; não prometa que pode mudar e não peça nova confirmação para encaminhar. Não declare cancelamento ou remarcação realizados. Escolher outra opção antes de concluir um agendamento, negar uma alteração ou perguntar genericamente sobre a política não é pedido de cancelamento/remarcação. Na dúvida, esclareça a intenção sem alterar a agenda. O sistema entrega o aviso e protocolo após confirmar o encaminhamento; na homologação o efeito é somente simulado.";

export function perguntaAlteracaoAgendamento(): Record<string, PerguntaJev> {
  return {
    alteracao_agendamento: {
      type: "choice",
      instructions:
        "A mensagem atual solicita cancelar ou remarcar um atendimento já marcado? Considere o histórico e o estado para referências como 'o de amanhã', inclusive para dependentes e ao retomar a conversa. Classifique o pedido mesmo se vier junto de um aceite ou outra pergunta. Não transforme escolha de vaga ainda não reservada, negação ou pergunta geral de política em alteração. Não presuma agendamento existente só porque a IA ofereceu um horário.",
      criteria: {
        cancelamento:
          "Solicita cancelar/desmarcar atendimento já marcado, inclusive 'pode ser 8h, aí cancela o de amanhã'.",
        remarcacao:
          "Solicita mudar data, horário ou profissional de atendimento já marcado, inclusive 'amanhã ela tem fisio, dá pra mudar para sábado?'. Se também pede cancelar o antigo para substituí-lo, use remarcação.",
        nenhum:
          "Não pede alterar uma reserva existente: escolha antes de gravar, novo agendamento, informação geral, negação ou intenção incerta.",
      },
    },
  };
}

export function alteracaoPeloJev(r: RespostaJev | undefined): AlteracaoAgendamento | null {
  return typeof r?.confidence === "number" &&
    r.confidence >= 0.8 &&
    (r.choice === "cancelamento" || r.choice === "remarcacao")
    ? r.choice
    : null;
}

/** Fallback conservador para pedidos explícitos, inclusive com Jev indisponível. */
export function alteracaoExplicita(
  mensagem: string,
  reservaConfirmada: boolean,
): AlteracaoAgendamento | null {
  const texto = mensagem
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let cancelamento = false;
  for (const parte of texto.split(/[.!?;\n]|\bmas\b/)) {
    // Política, hipótese ou negação não autorizam encaminhamento automático.
    if (/\b(?:se|caso|politica|multa|taxa)\b|\bcomo\s+(?:funciona|faco)\b/.test(parte)) continue;
    if (
      /\b(?:nao|nunca|nem)\s+(?:(?:quero|preciso|precisa|vou|vai|desejo|pode|deve)\s+)?(?:mais\s+)?(?:cancel\w*|desmarc\w*|remarc\w*|reagend\w*|mud\w*|troc\w*|alter\w*)\b/.test(
        parte,
      )
    )
      continue;
    if (/\b(?:remarcar|remarca|remarque|reagendar|reagenda|reagende)\b/.test(parte))
      return "remarcacao";
    const referencia =
      reservaConfirmada ||
      /\b(?:ja\s+(?:marcad[ao]|agendad[ao])|minha consulta|meu exame|meu agendamento|o de amanha|a de amanha)\b/.test(
        parte,
      );
    if (
      referencia &&
      /\b(?:mudar|muda|mude|trocar|troca|troque|alterar|altere)\b/.test(parte) &&
      /\b(?:horario|data|dia|medico|profissional|manha|tarde|noite|sabado|domingo|segunda|terca|quarta|quinta|sexta|amanha)\b/.test(
        parte,
      )
    )
      return "remarcacao";
    if (
      /\b(?:cancelar|cancela|cancele|desmarcar|desmarca|desmarque)\b/.test(parte) &&
      (referencia || /\b(?:consulta|exame|procedimento|agendamento|reserva)\b/.test(parte)) &&
      !/\b(?:pix|cartao|boleto|pagamento|assinatura)\b/.test(parte)
    )
      cancelamento = true;
  }
  return cancelamento ? "cancelamento" : null;
}

export function motivoAlteracao(tipo: AlteracaoAgendamento): string {
  return tipo === "cancelamento"
    ? "CANCELAMENTO_SOLICITADO: o paciente pediu cancelar um atendimento. Cancelamentos são realizados exclusivamente pela equipe humana."
    : "REMARCACAO_SOLICITADA: o paciente pediu mudar um atendimento já marcado. Remarcações são realizadas exclusivamente pela equipe humana.";
}
