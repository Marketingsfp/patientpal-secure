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

/**
 * Itens do orçamento vinculados a ESTE agendamento.
 * Retorna vazio quando nenhum deles tem entrada (`sinal_valor`), mantendo o
 * fluxo de sinal/saldo restrito a orçamentos odontológicos com entrada.
 * Quando há entrada em pelo menos um item, TODOS os itens escolhidos entram
 * no cálculo — inclusive os sem entrada.
 */
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
  const itens = (data ?? []) as ItemRow[];
  const temSinal = itens.some((i) => Number(i.sinal_valor ?? 0) > 0);
  return temSinal ? itens : [];
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
 * Reaplica a etapa de sinal/saldo usando um FATOR por item (0..1) — o desconto
 * do convênio apurado no momento do pagamento. Os valores gravados no
 * orçamento continuam sendo os particulares; o fator só ajusta o que o
 * paciente paga agora. Função pura: não consulta o banco.
 */
export function aplicarFatoresEtapa(
  etapa: EtapaSinal,
  fatores: Record<string, number> | null | undefined,
): EtapaSinal {
  if (!fatores || Object.keys(fatores).length === 0) return etapa;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const itens = etapa.itens.map((i) => {
    const f = Number.isFinite(fatores[i.id]) ? Math.max(0, Number(fatores[i.id])) : 1;
    const total = r2(i.total * f);
    const pago = r2(i.pago * f);
    return {
      ...i,
      total,
      sinal: r2(i.sinal * f),
      pago,
      restante: r2(Math.max(0, total - pago)),
    };
  });
  const total = r2(itens.reduce((s, i) => s + i.total, 0));
  const pago = r2(itens.reduce((s, i) => s + i.pago, 0));
  const sinal = r2(itens.reduce((s, i) => s + i.sinal, 0));
  const restante = r2(Math.max(0, total - pago));
  const valor = pago < sinal - 0.004 ? r2(sinal - pago) : restante;
  return { ...etapa, itens, total, pago, restante, valor };
}

/**
 * Registra o valor efetivamente recebido nos itens do orçamento, distribuindo-o
 * proporcionalmente ao saldo de cada item. Nunca sobrescreve o que já foi pago
 * nem ultrapassa o total do item.
 * Chamado depois que o lançamento financeiro foi gravado com sucesso.
 *
 * `fatores` (opcional) é o desconto de convênio aplicado na cobrança, por item.
 * O valor recebido chega já com desconto; para que `valor_pago` continue na
 * mesma moeda do orçamento (valor particular), a baixa é convertida de volta
 * dividindo pelo fator do item.
 */
export async function registrarPagamentoEtapaSinal(
  agendamentoId: string,
  valorPago?: number,
  fatores?: Record<string, number> | null,
): Promise<void> {
  const itens = await itensComSinal(agendamentoId);
  if (!itens.length) return;
  const agora = new Date().toISOString();
  const fatorDe = (id: string) => {
    const f = fatores ? Number(fatores[id]) : NaN;
    return Number.isFinite(f) && f > 0 ? f : 1;
  };
  const saldos = itens.map((i) => {
    const total = totalItem(i);
    const pagoAtual = Number(i.valor_pago ?? 0);
    const saldoBruto = Math.max(0, total - pagoAtual);
    return {
      item: i,
      total,
      pagoAtual,
      fator: fatorDe(i.id),
      /** Saldo bruto (valor particular gravado no orçamento). */
      saldoBruto,
      /** Saldo com o desconto do convênio — é o que o paciente efetivamente paga. */
      saldo: Math.round(saldoBruto * fatorDe(i.id) * 100) / 100,
    };
  });
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
    // Converte a cota recebida (com desconto) de volta para o valor
    // particular gravado no item, para que a quitação feche corretamente.
    const aplicarBruto = Math.round((aplicar / s.fator) * 100) / 100;
    const novoPago = Math.min(s.total, Math.round((s.pagoAtual + aplicarBruto) * 100) / 100);
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
