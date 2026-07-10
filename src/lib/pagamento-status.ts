import { supabase } from "@/integrations/supabase/client";

export type MotivoPago = "caixa" | "orcamento" | null;
export type StatusPagamento = { pago: boolean; motivo: MotivoPago };

/**
 * Considera-se PAGO quando houver pelo menos um destes vínculos:
 * 1. fin_lancamentos (receita) vinculado ao agendamento     → motivo: "caixa"
 * 2. agendamento_orcamento_itens com orçamento pago         → motivo: "orcamento"
 *
 * O paciente paga ANTES da consulta. Telas downstream (triagem, atendimento)
 * usam este helper para bloquear o avanço enquanto não houver pagamento.
 * Convênio / Cartão Benefícios geram um fin_lancamentos quitado (mesmo que
 * R$ 0 do paciente), portanto também são detectados pela regra (1).
 */
export async function agendamentosStatusPagamento(
  ids: string[],
): Promise<Map<string, StatusPagamento>> {
  const out = new Map<string, StatusPagamento>();
  if (!ids.length) return out;
  ids.forEach((id) => out.set(id, { pago: false, motivo: null }));

  // 1) lançamentos de receita
  const { data: lancs } = await supabase
    .from("fin_lancamentos")
    .select("agendamento_id")
    .eq("tipo", "receita")
    .in("agendamento_id", ids);
  ((lancs ?? []) as Array<{ agendamento_id: string | null }>).forEach((r) => {
    if (r.agendamento_id) out.set(r.agendamento_id, { pago: true, motivo: "caixa" });
  });

  // 2) itens de orçamento vinculados
  const faltam = ids.filter((id) => !out.get(id)?.pago);
  if (faltam.length) {
    const { data: orcItens } = await supabase
      .from("agendamento_orcamento_itens")
      .select("agendamento_id")
      .in("agendamento_id", faltam);
    ((orcItens ?? []) as Array<{ agendamento_id: string | null }>).forEach((r) => {
      if (r.agendamento_id) out.set(r.agendamento_id, { pago: true, motivo: "orcamento" });
    });
  }

  return out;
}

export async function agendamentoStatusPagamento(id: string): Promise<StatusPagamento> {
  const map = await agendamentosStatusPagamento([id]);
  return map.get(id) ?? { pago: false, motivo: null };
}

export function rotuloMotivoPago(m: MotivoPago): string {
  switch (m) {
    case "caixa": return "Pago no caixa";
    case "orcamento": return "Orçamento pago";
    default: return "Pendente";
  }
}