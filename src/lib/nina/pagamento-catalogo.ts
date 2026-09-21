/** Regra da clínica: o preço cadastrado no cartão também vale para Pix. */
export const REGRA_PIX_CARTAO =
  "Pix tem sempre o mesmo valor do cartão. O valor cadastrado como cartão também autoriza Pix. " +
  'Informe os dois juntos, na mesma frase ou linha: "Pix/cartão: R$ X,XX", inclusive quando o paciente perguntar apenas por Pix ou apenas por cartão. ' +
  "Toda menção ao preço em Pix ou cartão, inclusive na frase de abertura, deve citar Pix/cartão. Não escreva uma frase com preço só no Pix ou só no cartão para depois agrupar os dois em uma lista. " +
  "Dinheiro permanece separado: nunca use seu preço como preço do Pix. Preserve as condições do atendimento e informe parcelamento somente para cartão. " +
  "Quando o paciente perguntar sobre pagamento por Pix, desconto ou diferença entre as formas de pagamento, explique que Pix é aceito somente de forma antecipada pelo WhatsApp e que pagamento em dinheiro tem desconto. " +
  "O valor cadastrado em dinheiro já é o valor com desconto: não aplique desconto adicional nem invente percentual. A exigência de antecipação pelo WhatsApp é exclusiva do Pix; compartilhar o preço não torna essa condição obrigatória para o cartão. " +
  "Não acrescente essa explicação a toda listagem de preços sem que o paciente pergunte sobre essas condições. " +
  "Não invente valor quando o preço do cartão não estiver informado.";

/** Ausência de cadastro não prova recusa; Pix continua autorizado pelo cartão. */
export const REGRA_FORMA_PAGAMENTO_AUSENTE =
  "Quando uma forma de pagamento não estiver cadastrada para o atendimento, informe que precisa confirmar com a equipe e siga o fluxo de atendimento humano para essa pendência. " +
  "Não afirme que é aceita nem que não é aceita com base apenas na ausência, em uma lista vazia ou em falha de consulta. Uma recusa exige informação explícita da fonte. " +
  "Apresente as alternativas confirmadas, sem inventar valores. Pix já está autorizado quando houver valor de cartão, conforme a regra Pix/cartão.";

export const REGRA_APRESENTACAO_VALORES =
  "Compare todas as opções publicadas do mesmo atendimento, incluindo dinheiro, Pix/cartão, parcelamento e condições. " +
  "Se todos os valores e condições forem iguais, informe os valores uma única vez em um bloco comum e diga a quais profissionais se aplicam. " +
  "Se pelo menos um valor ou condição for diferente, apresente o valor de cada profissional no respectivo bloco. " +
  "Campo ausente não comprova igualdade; nesse caso mantenha os valores conhecidos associados às respectivas opções e indique apenas a lacuna relevante. " +
  "Nunca use só o preço do primeiro registro como preço de todos nem combine consultas ou procedimentos diferentes.";

/** Idempotente; mantém qualificadores como crédito/débito e não muda valores. */
export function rotuloPagamentoNina(forma: string): string {
  if (/\bpix\b/i.test(forma)) return forma;
  return forma.replace(/\bcart[aã]o\b/i, "Pix/cartão");
}

/** Atualiza apenas rótulos de preço; não altera condições nem prosa clínica. */
export function rotularValoresCartao(texto: string): string {
  return texto.replace(
    /\b(?:pix\s*(?:\/|e)\s*)?cart[aã]o(?=\s*:\s*(?:R\$|\d|[—–-]|(?:valor\s+)?n[aã]o\s+informado))/giu,
    "Pix/cartão",
  );
}

/** Mantém listas ausentes/malformadas distinguíveis de uma lista vazia. */
export function formasPagamentoNina(formas: unknown): unknown {
  if (!Array.isArray(formas)) return formas;
  return formas.map((f) =>
    f && typeof f === "object" && typeof f.forma === "string"
      ? { ...f, forma: rotuloPagamentoNina(f.forma) }
      : f,
  );
}
