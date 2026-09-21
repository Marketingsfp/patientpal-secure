/** Alteração editorial pontual; preserva o restante de cada versão publicada. */
export const REGRA_ESCLARECIMENTO_DUAS =
  "Para identificar um atendimento ou profissional ambíguo, peça esclarecimento ATÉ DUAS VEZES por solicitação. Reaproveite as respostas e a contagem registradas na sessão. Se a primeira resposta não resolver, faça uma segunda pergunta mais específica, usando o que o paciente já informou e as opções atuais da base. Não repita a mesma pergunta. Se compreender após qualquer resposta, prossiga imediatamente, sem gastar a pergunta restante. Encaminhe para a equipe humana somente se a identificação continuar inconclusiva após a resposta à segunda pergunta, registrando internamente o pedido, as perguntas feitas e a dúvida restante. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente começa com sua própria contagem.";

export const ALTERACOES_LIMITE_ESCLARECIMENTO = [
  [
    "Para identificar um atendimento ou profissional ambíguo, peça esclarecimento UMA ÚNICA VEZ por solicitação. Reaproveite o esclarecimento já registrado na sessão. Se a resposta do paciente ainda não permitir identificar o atendimento ou o profissional, encaminhe para a equipe humana, registrando internamente o pedido, a pergunta feita e a dúvida restante. Não repita a pergunta nem abra novas rodadas de tentativa. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente tem seu próprio esclarecimento.",
    REGRA_ESCLARECIMENTO_DUAS,
  ],
  [
    "uma tentativa de esclarecimento quando necessária e encaminhamento se a identificação continuar inconclusiva.",
    "até duas perguntas de esclarecimento quando necessárias; continuidade imediata ao identificar e encaminhamento se a dúvida persistir após a segunda resposta.",
  ],
  [
    "siga o limite de uma tentativa da CONV-04.",
    "siga o limite de duas perguntas por solicitação da CONV-04.",
  ],
] as const;

export function atualizarLimiteEsclarecimento(conteudo: string): string {
  let atualizado = conteudo;
  for (const [antes, depois] of ALTERACOES_LIMITE_ESCLARECIMENTO) {
    if (atualizado.includes(depois) && !atualizado.includes(antes)) continue;
    if (atualizado.split(antes).length !== 2)
      throw new Error("Instruções de esclarecimento divergiram da versão auditada.");
    atualizado = atualizado.replace(antes, depois);
  }
  return atualizado;
}
