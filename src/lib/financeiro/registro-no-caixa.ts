/**
 * Este lançamento deve movimentar a gaveta do caixa?
 *
 * Regra única para a pergunta mais cara do financeiro desta clínica: o
 * dinheiro deste lançamento está na gaveta de hoje ou não? Errar para mais
 * cria uma SOBRA FANTASMA — o fechamento acusa dinheiro que a atendente nunca
 * vai encontrar para conferir contra o cupom impresso; errar para menos
 * esconde dinheiro que está fisicamente lá.
 *
 * Existe como função pura, separada da tela, porque a condição já tem três
 * motivos independentes de exclusão e vinha crescendo dentro de um `if` no
 * meio do diálogo de pagamento, sem nenhum teste por trás.
 */
export interface EntradaRegistroNoCaixa {
  /** Há operador autenticado? Sem ele não existe sessão de caixa para lançar. */
  temOperador: boolean;
  /** Valor que entra NESTA data (já descontadas parcelas de outros dias). */
  valorPrincipal: number;
  /** Forma final gravada no lançamento. */
  formaPagamento: string | null;
  /** O lançamento está amarrado a um atendimento da agenda? */
  temAgendamento: boolean;
  /** Forma "Pago no sistema anterior" (virada da Clínica Total). */
  ehPagoSistemaAnterior: boolean;
  /** Guia retroativa cujo valor já tinha sido recebido em outro dia. */
  recebidoAntes: boolean;
}

export function deveRegistrarNoCaixa(e: EntradaRegistroNoCaixa): boolean {
  // Sem operador não há sessão de caixa em que lançar.
  if (!e.temOperador) return false;
  // Pago na Clínica Total antes da virada: o dinheiro entrou em outro sistema.
  if (e.ehPagoSistemaAnterior) return false;
  // Guia retroativa já quitada: o dinheiro entrou em outro dia. A receita
  // continua na competência do atendimento e o repasse é apurado normalmente
  // (a apuração lê `fin_lancamentos`), mas a gaveta de hoje não é tocada.
  if (e.recebidoAntes) return false;
  // Sobra o caso normal. O movimento de R$ 0,00 é criado de propósito quando
  // há gratuidade de convênio ou vínculo com a agenda: a linha-sombra é o que
  // faz o atendimento aparecer como liberado no caixa e no fechamento.
  return e.valorPrincipal > 0 || e.formaPagamento === "convenio_gratuidade" || e.temAgendamento;
}
