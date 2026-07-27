import { supabase } from "@/integrations/supabase/client";

/**
 * Pagamento em duas etapas (sinal + saldo) para itens de orçamento.
 *
 * Regra (Odontologia, válida para as 3 clínicas):
 *  - O item do orçamento pode ter `sinal_valor` (entrada em R$).
 *  - A 1ª cobrança na agenda sugere o SINAL; a 2ª sugere o SALDO restante.
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
  itemIds: string[];
};

type ItemRow = {
  id: string;
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
    .select("id, quantidade, valor_unitario, valor_total, sinal_valor, valor_pago, status_financeiro")
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
  if (pago < sinal - 0.004) {
    return { etapa: "sinal", valor: Math.round((sinal - pago) * 100) / 100, total, pago, itemIds };
  }
  if (pago < total - 0.004) {
    return { etapa: "saldo", valor: Math.round((total - pago) * 100) / 100, total, pago, itemIds };
  }
  return null;
}

/**
 * Registra o pagamento da etapa nos itens do orçamento.
 * Chamado depois que o lançamento financeiro foi gravado com sucesso.
 */
export async function registrarPagamentoEtapaSinal(
  agendamentoId: string,
  etapa?: "sinal" | "saldo",
): Promise<void> {
  const itens = await itensComSinal(agendamentoId);
  if (!itens.length) return;
  const agora = new Date().toISOString();
  const pagoTotal = itens.reduce((s, i) => s + Number(i.valor_pago ?? 0), 0);
  const sinalTotal = itens.reduce((s, i) => s + Number(i.sinal_valor ?? 0), 0);
  const alvo = etapa ?? (pagoTotal < sinalTotal - 0.004 ? "sinal" : "saldo");
  for (const i of itens) {
    const t = totalItem(i);
    const patch =
      alvo === "sinal"
        ? {
          valor_pago: Number(i.sinal_valor ?? 0),
          sinal_pago_em: agora,
          status_financeiro: Number(i.sinal_valor ?? 0) >= t - 0.004 ? "pago" : "parcial",
        }
        : { valor_pago: t, saldo_pago_em: agora, status_financeiro: "pago" };
    await supabase.from("orcamento_itens").update(patch as never).eq("id", i.id);
  }
}
