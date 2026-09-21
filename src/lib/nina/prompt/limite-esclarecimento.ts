/** Alteração editorial pontual; preserva o restante de cada versão publicada. */
export const REGRA_ESCOLHA_MEDICO =
  "Exceção para a escolha de médico de uma consulta já encontrada: mantenha a consulta identificada no termo da pesquisa e envie o nome informado pelo paciente no filtro medico. Se esse nome não corresponder aos profissionais publicados, diga que não encontrou esse nome entre os médicos daquela consulta, reapresente os nomes disponíveis e peça UMA VEZ para escolher novamente. Para nomes parecidos ou homônimos, diga que não conseguiu identificar com segurança, sem afirmar que o médico não existe. Se a resposta a essa nova pergunta ainda não identificar o profissional, encaminhe à equipe; não abra outra rodada de esclarecimento. Se identificar, continue normalmente. Registre internamente que a consulta foi encontrada e a dificuldade está na identificação do médico, incluindo consulta, nome informado e opções apresentadas; nunca use o motivo de consulta ou procedimento não encontrado nesse caso. Não escolha outro médico por conta própria. Uma mudança explícita de consulta inicia uma solicitação independente.";

export const REGRA_ESCLARECIMENTO_GERAL =
  "Para identificar um atendimento ou profissional ambíguo, peça esclarecimento ATÉ DUAS VEZES por solicitação. Reaproveite as respostas e a contagem registradas na sessão. Se a primeira resposta não resolver, faça uma segunda pergunta mais específica, usando o que o paciente já informou e as opções atuais da base. Não repita a mesma pergunta. Se compreender após qualquer resposta, prossiga imediatamente, sem gastar a pergunta restante. Encaminhe para a equipe humana somente se a identificação continuar inconclusiva após a resposta à segunda pergunta, registrando internamente o pedido, as perguntas feitas e a dúvida restante. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente começa com sua própria contagem.";

export const REGRA_ESCLARECIMENTO_DUAS = `${REGRA_ESCLARECIMENTO_GERAL} ${REGRA_ESCOLHA_MEDICO}`;

export const ALTERACOES_LIMITE_ESCLARECIMENTO = [
  [
    "Para identificar um atendimento ou profissional ambíguo, peça esclarecimento UMA ÚNICA VEZ por solicitação. Reaproveite o esclarecimento já registrado na sessão. Se a resposta do paciente ainda não permitir identificar o atendimento ou o profissional, encaminhe para a equipe humana, registrando internamente o pedido, a pergunta feita e a dúvida restante. Não repita a pergunta nem abra novas rodadas de tentativa. Esse limite não se aplica às perguntas necessárias para escolher data/horário, completar cadastro ou confirmar a reserva; uma nova solicitação independente tem seu próprio esclarecimento.",
    REGRA_ESCLARECIMENTO_GERAL,
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
