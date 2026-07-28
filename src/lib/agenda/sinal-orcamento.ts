import { supabase } from "@/integrations/supabase/client";

/**
 * Pagamento parcelado (entrada/sinal + saldo em várias vezes) para itens de orçamento.
 *
 * Regra (Odontologia, válida para as 3 clínicas):
 *  - O item do orçamento pode ter `sinal_valor` (entrada em R$).
 *  - A 1ª cobrança na agenda sugere o SINAL; as seguintes sugerem o SALDO
 *    restante, mas o caixa pode informar qualquer valor (pagamento parcial).
 *  - Pagar o sinal já libera o atendimento (status_financeiro = 'parcial').
 */

export type EtapaSinal = {
  etapa: "sinal" | "saldo";
  /** Valor sugerido para esta etapa. */
  valor: number;
  /** Total de todos os itens com sinal vinculados ao agendamento. */
  total: number;
  /** Quanto já foi pago desses itens. */
  pago: number;
  /** Quanto ainda falta pagar. */
  restante: number;
  itemIds: string[];
  /** Detalhe por item — permite mostrar qual item tem entrada e de quanto. */
  itens: Array<{
    id: string;
    descricao: string;
    total: number;
    sinal: number;
    pago: number;
    restante: number;
  }>;
};

type ItemRow = {
  id: string;
  descricao: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  sinal_valor: number | null;
  valor_pago: number | null;
  status_financeiro: string | null;
};

const totalItem = (i: ItemRow) =>
  Number(i.valor_total ?? (Number(i.quantidade ?? 1) * Number(i.valor_unitario ?? 0)));

async function itensComSinal(agendamentoId: string): Promise<ItemRow[]> {
  const { data: links } = await supabase
    .from("agendamento_orcamento_itens")
    .select("orcamento_item_id")
    .eq("agendamento_id", agendamentoId);
  const ids = ((links ?? []) as Array<{ orcamento_item_id: string }>).map((r) => r.orcamento_item_id);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("orcamento_itens")
    .select("id, descricao, quantidade, valor_unitario, valor_total, sinal_valor, valor_pago, status_financeiro")
    .in("id", ids);
  return ((data ?? []) as ItemRow[]).filter((i) => Number(i.sinal_valor ?? 0) > 0);
}

/** Etapa pendente de cobrança, ou null quando não há sinal ou já está quitado. */
export async function obterEtapaSinal(agendamentoId: string): Promise<EtapaSinal | null> {
  const itens = await itensComSinal(agendamentoId);
  if (!itens.length) return null;
  const total = itens.reduce((s, i) => s + totalItem(i), 0);
  const pago = itens.reduce((s, i) => s + Number(i.valor_pago ?? 0), 0);
  const sinal = itens.reduce((s, i) => s + Number(i.sinal_valor ?? 0), 0);
  const itemIds = itens.map((i) => i.id);
  const restante = Math.round(Math.max(0, total - pago) * 100) / 100;
  const detalhe = itens.map((i) => {
    const t = totalItem(i);
    const p = Number(i.valor_pago ?? 0);
    return {
      id: i.id,
      descricao: i.descricao ?? "Item do orçamento",
      total: t,
      sinal: Number(i.sinal_valor ?? 0),
      pago: p,
      restante: Math.round(Math.max(0, t - p) * 100) / 100,
    };
  });
  if (pago < sinal - 0.004) {
    return { etapa: "sinal", valor: Math.round((sinal - pago) * 100) / 100, total, pago, restante, itemIds, itens: detalhe };
  }
  if (pago < total - 0.004) {
    return { etapa: "saldo", valor: restante, total, pago, restante, itemIds, itens: detalhe };
  }
  return null;
}

/**
 * Registra o valor efetivamente recebido nos itens do orçamento, distribuindo-o
 * proporcionalmente ao saldo de cada item. Nunca sobrescreve o que já foi pago
 * nem ultrapassa o total do item.
 * Chamado depois que o lançamento financeiro foi gravado com sucesso.
 */
export async function registrarPagamentoEtapaSinal(
  agendamentoId: string,
  valorPago?: number,
): Promise<void> {
  const itens = await itensComSinal(agendamentoId);
  if (!itens.length) return;
  const agora = new Date().toISOString();
  const saldos = itens.map((i) => ({
    item: i,
    total: totalItem(i),
    pagoAtual: Number(i.valor_pago ?? 0),
    saldo: Math.max(0, totalItem(i) - Number(i.valor_pago ?? 0)),
  }));
  const saldoTotal = saldos.reduce((s, x) => s + x.saldo, 0);
  if (saldoTotal <= 0.004) return;
  // Sem valor informado (compatibilidade): quita o saldo restante.
  const bruto = valorPago == null || !isFinite(valorPago) || valorPago <= 0 ? saldoTotal : valorPago;
  let restanteDistribuir = Math.round(Math.min(bruto, saldoTotal) * 100) / 100;

  for (let idx = 0; idx < saldos.length; idx++) {
    const s = saldos[idx];
    if (s.saldo <= 0.004 || restanteDistribuir <= 0.004) continue;
    const ultimo = idx === saldos.length - 1;
    const cota = ultimo
      ? Math.min(s.saldo, restanteDistribuir)
      : Math.min(s.saldo, Math.round((restanteDistribuir * (s.saldo / saldoTotal)) * 100) / 100);
    const aplicar = Math.round(cota * 100) / 100;
    if (aplicar <= 0) continue;
    const novoPago = Math.min(s.total, Math.round((s.pagoAtual + aplicar) * 100) / 100);
    const quitado = novoPago >= s.total - 0.004;
    const patch: Record<string, unknown> = {
      valor_pago: novoPago,
      status_financeiro: quitado ? "pago" : "parcial",
    };
    if (s.pagoAtual <= 0.004) patch.sinal_pago_em = agora;
    if (quitado) patch.saldo_pago_em = agora;
    await supabase.from("orcamento_itens").update(patch as never).eq("id", s.item.id);
    restanteDistribuir = Math.round((restanteDistribuir - aplicar) * 100) / 100;
  }
}
