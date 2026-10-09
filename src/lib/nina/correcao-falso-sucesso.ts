/**
 * Correção de uma resposta barrada por afirmar reserva sem gravação.
 * O rascunho barrado NUNCA chegou ao paciente: ele viaja só dentro desta
 * instrução, nunca como mensagem da assistente no histórico. Assim a nova
 * resposta não pede desculpas nem "corrige" algo que o paciente não viu
 * (homologação 06/10/2026: "Peço desculpas pela forma como me expressei").
 */
export type EtapaCorrecao = "aguardando_dados" | "aguardando_confirmacao" | "sem_escolha";

export function mensagemCorrecaoFalsoSucesso(rascunho: string, etapa: EtapaCorrecao): string {
  const continuidade =
    etapa === "aguardando_dados"
      ? "O paciente já escolheu um horário e o fluxo está na coleta dos dados: descreva o horário como escolhido (nunca reservado, marcado ou confirmado) e continue pedindo os dados de quem será atendido que o rascunho pedia."
      : etapa === "aguardando_confirmacao"
        ? "O paciente já escolheu um horário e falta a confirmação final: descreva o horário como escolhido (nunca reservado, marcado ou confirmado) e não peça novos dados."
        : "Esta correção não autoriza consultar vagas, agendar nem iniciar coleta de dados que o fluxo não pediu. Não transforme um pedido de informação em pedido de agendamento.";
  return [
    "O rascunho abaixo NÃO foi enviado ao paciente: ele afirmava uma reserva ou prometia um agendamento sem confirmação gravada no sistema.",
    `Rascunho não enviado:\n"""\n${rascunho}\n"""`,
    "Escreva a resposta que será enviada, como se fosse a primeira: não peça desculpas, não mencione correção, erro ou mensagem anterior.",
    "Mantenha as informações publicadas que respondem ao pedido atual e retire apenas a afirmação de reserva ou promessa. Descrever a modalidade de atendimento agendado não significa que uma consulta foi marcada.",
    continuidade,
    "Não consulte vagas nem agende nesta correção.",
  ].join("\n\n");
}
