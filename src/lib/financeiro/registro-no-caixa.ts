/**
 * Que movimento de caixa este lançamento deve gerar?
 *
 * Regra única para a pergunta mais cara do financeiro desta clínica: o
 * dinheiro deste lançamento está na gaveta de hoje ou não? Errar para mais
 * cria uma SOBRA FANTASMA — o fechamento acusa dinheiro que a atendente nunca
 * vai encontrar para conferir contra o cupom impresso; errar para menos
 * esconde dinheiro que está fisicamente lá.
 *
 * Existe como função pura, separada da tela, porque a condição tem vários
 * motivos independentes e vinha crescendo dentro de um `if` no meio do diálogo
 * de pagamento, sem nenhum teste por trás.
 */
export interface EntradaRegistroNoCaixa {
  /** Há operador autenticado? Sem ele não existe sessão de caixa para lançar. */
  temOperador: boolean;
  /** "receita" cria recebimento; "despesa" cria despesa. */
  tipoLancamento: "receita" | "despesa";
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

export type PlanoMovimento =
  | { registra: false }
  | {
      registra: true;
      tipo: "recebimento" | "despesa" | "registro";
      /**
       * true = o movimento vai para o caixa de HOJE, ignorando a data
       * retroativa. false = a RPC decide (caixa do dia se ainda aberto, senão
       * o de hoje).
       */
      forcarSessaoHoje: boolean;
    };

const NAO_REGISTRA: PlanoMovimento = { registra: false };

export function planoDeMovimento(e: EntradaRegistroNoCaixa): PlanoMovimento {
  // Sem operador não há sessão de caixa em que lançar.
  if (!e.temOperador) return NAO_REGISTRA;

  // Pago na Clínica Total antes da virada: o dinheiro entrou em outro sistema,
  // e nem sequer há uma data de caixa deste sistema a que ele pertença.
  if (e.ehPagoSistemaAnterior) return NAO_REGISTRA;

  // Guia retroativa já quitada. Reproduz o comportamento do sistema antigo,
  // que a recepção conhece e espera:
  //   * a receita fatura na data original do atendimento (competência);
  //   * a linha APARECE no extrato do dia da digitação, para auditoria — foi
  //     o que a primeira versão desta regra perdeu ao não criar movimento
  //     nenhum: a atendente não conseguia provar que tinha emitido a guia;
  //   * e pesa R$ 0,00 no dinheiro esperado da gaveta (`SINAL_NO_SALDO`).
  // Vai para o caixa de HOJE porque é o dia da digitação — é lá que a linha
  // precisa ser vista, e um caixa antigo já fechado nunca é reescrito.
  if (e.recebidoAntes) {
    return { registra: true, tipo: "registro", forcarSessaoHoje: true };
  }

  // Caso normal. O movimento de R$ 0,00 é criado de propósito quando há
  // gratuidade de convênio ou vínculo com a agenda: a linha-sombra é o que faz
  // o atendimento aparecer como liberado no caixa e no fechamento.
  const temMovimento =
    e.valorPrincipal > 0 || e.formaPagamento === "convenio_gratuidade" || e.temAgendamento;
  if (!temMovimento) return NAO_REGISTRA;

  return {
    registra: true,
    tipo: e.tipoLancamento === "receita" ? "recebimento" : "despesa",
    // Data retroativa com pagamento AGORA: quem decide a gaveta é a RPC, que
    // conhece o estado da sessão daquele dia e esta tela não.
    //   * caixa daquele dia ainda ABERTO -> recebimento com valor cheio nele;
    //   * caixa daquele dia já FECHADO   -> a RPC rebaixa o tipo para
    //     `registro` no caixa de hoje, para não somar um centavo num dia a
    //     que o dinheiro não pertence.
    // Por isso o tipo devolvido aqui é a INTENÇÃO, não necessariamente o que
    // será gravado — ver `fn_registrar_lancamento_e_caixa`.
    forcarSessaoHoje: false,
  };
}
