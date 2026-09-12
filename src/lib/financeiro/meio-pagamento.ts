/**
 * Onde o dinheiro está: gaveta (espécie), banco (PIX, cartões, boleto,
 * transferência) ou outros (convênio, gratuidade, sem informação).
 *
 * Mora num arquivo próprio porque as duas telas usam a mesma separação — o
 * Movimento de Caixa (régua da gaveta) e o Dashboard do Financeiro (régua do
 * Rateio) — e importar uma da outra criaria ciclo de importação.
 */
import type { FormaCanonica } from "@/lib/financeiro/formas-pagamento";

const round2 = (v: number) => +v.toFixed(2);

export interface MeioSaldo {
  /** Receitas recebidas nesse meio. */
  entradas: number;
  /** Despesas pagas nesse meio. */
  saidas: number;
  /** entradas − saídas. */
  saldo: number;
}

export interface SaldoPorMeio {
  /** Dinheiro vivo — o que precisa estar na gaveta. */
  especie: MeioSaldo;
  /** PIX, cartões, boleto e transferência — cai na conta. */
  banco: MeioSaldo;
  /** Convênio, gratuidade, misto não decomposto e sem informação. */
  outros: MeioSaldo;
}

/** Formas que representam dinheiro em conta bancária. */
export const FORMAS_BANCO: FormaCanonica[] = [
  "pix",
  "debito",
  "credito",
  "legado_cartao",
  "boleto",
  "transferencia",
];

export const meioDaForma = (f: FormaCanonica): keyof SaldoPorMeio =>
  f === "dinheiro" ? "especie" : FORMAS_BANCO.includes(f) ? "banco" : "outros";

export const zeroSaldoPorMeio = (): SaldoPorMeio => ({
  especie: { entradas: 0, saidas: 0, saldo: 0 },
  banco: { entradas: 0, saidas: 0, saldo: 0 },
  outros: { entradas: 0, saidas: 0, saldo: 0 },
});

export function somarNoMeio(
  acc: SaldoPorMeio,
  forma: FormaCanonica,
  valor: number,
  tipo: "receita" | "despesa",
) {
  const alvo = acc[meioDaForma(forma)];
  const v = Number(valor) || 0;
  if (tipo === "receita") alvo.entradas += v;
  else alvo.saidas += v;
}

export function fecharSaldoPorMeio(acc: SaldoPorMeio): SaldoPorMeio {
  for (const k of ["especie", "banco", "outros"] as const) {
    acc[k].entradas = round2(acc[k].entradas);
    acc[k].saidas = round2(acc[k].saidas);
    acc[k].saldo = round2(acc[k].entradas - acc[k].saidas);
  }
  return acc;
}
