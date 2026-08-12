/**
 * Regras de conferência e fechamento de caixa.
 *
 * Dinheiro em gaveta é o único valor físico conferível. As demais formas
 * (PIX, cartões, convênio) não passam pela gaveta — entram no total do turno
 * mas não no saldo esperado em espécie.
 */

export interface ComposicaoGaveta {
  /** Troco/fundo informado na abertura do caixa. */
  saldoInicial: number;
  /** Recebimentos liquidados em dinheiro (já líquidos de estorno em espécie). */
  recebimentosDinheiro: number;
  /** Aportes de dinheiro na gaveta durante o turno. */
  suprimentos: number;
  /** Retiradas de dinheiro da gaveta durante o turno. */
  sangrias: number;
  /** Despesas pagas em espécie direto da gaveta. */
  despesas: number;
}

/**
 * Saldo Inicial (Troco) + Recebimentos em Dinheiro + Suprimentos
 * − Sangrias − Despesas em espécie = Saldo Esperado na Gaveta.
 */
export function saldoEsperadoGaveta(c: ComposicaoGaveta): number {
  return (
    c.saldoInicial + c.recebimentosDinheiro + c.suprimentos - c.sangrias - c.despesas
  );
}

export type TipoDiferenca = "sobra" | "falta" | "exato";

export interface Diferenca {
  tipo: TipoDiferenca;
  /** Valor com sinal: positivo = sobra, negativo = falta. */
  valor: number;
  label: string;
  /** Classes utilitárias para destacar o resultado na UI. */
  cls: string;
}

/** Compara o contado fisicamente com o esperado e classifica a diferença. */
export function classificarDiferenca(contado: number, esperado: number): Diferenca {
  const valor = Number((contado - esperado).toFixed(2));
  if (Math.abs(valor) < 0.005) {
    return {
      tipo: "exato",
      valor: 0,
      label: "Caixa confere",
      cls: "bg-slate-50 border-slate-200 text-slate-700",
    };
  }
  if (valor > 0) {
    return {
      tipo: "sobra",
      valor,
      label: "Sobra em caixa",
      cls: "bg-emerald-50 border-emerald-300 text-emerald-800",
    };
  }
  return {
    tipo: "falta",
    valor,
    label: "Falta em caixa",
    cls: "bg-rose-50 border-rose-300 text-rose-800",
  };
}

/** Status exibido nas listagens de caixas anteriores. */
export type StatusCaixa = "aberto" | "fechado" | "em_conferencia";

/**
 * Um caixa fechado com diferença registrada fica "Em conferência" até que a
 * tesouraria valide a divergência.
 */
export function statusCaixa(
  status: string | null | undefined,
  diferenca: number | null | undefined,
): StatusCaixa {
  if (status !== "fechado") return "aberto";
  return Math.abs(Number(diferenca || 0)) > 0.005 ? "em_conferencia" : "fechado";
}

export const STATUS_CAIXA_LABEL: Record<StatusCaixa, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
  em_conferencia: "Em conferência",
};

export const STATUS_CAIXA_CLASS: Record<StatusCaixa, string> = {
  aberto: "bg-emerald-100 text-emerald-700 border-emerald-300",
  fechado: "bg-slate-100 text-slate-600 border-slate-300",
  em_conferencia: "bg-amber-100 text-amber-700 border-amber-300",
};