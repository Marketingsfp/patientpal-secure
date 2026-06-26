import { supabase } from "@/integrations/supabase/client";

export type MotivoPago = "caixa" | "orcamento" | "convenio" | "cartao_beneficios" | null;
export type StatusPagamento = { pago: boolean; motivo: MotivoPago };

/**
 * Considera-se PAGO quando houver pelo menos um destes vínculos:
 * 1. fin_lancamentos (receita) vinculado ao agendamento     → motivo: "caixa"
 * 2. agendamento_orcamento_itens com orçamento pago         → motivo: "orcamento"
 * 3. agendamentos.convenio_id preenchido                    → motivo: "convenio"
 * 4. agendamentos.contrato_id (cartão benefícios ativo)     → motivo: "cartao_beneficios"
 *
 * O paciente paga ANTES da consulta. Telas downstream (triagem, atendimento)
 * usam este helper para bloquear o avanço enquanto não houver pagamento.
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

  // 3 + 4) convênio / cartão benefícios direto no agendamento
  const ainda = ids.filter((id) => !out.get(id)?.pago);
  if (ainda.length) {
    const { data: ags } = await supabase
      .from("agendamentos")
      .select("id, convenio_id, contrato_id")
      .in("id", ainda);
    ((ags ?? []) as Array<{ id: string; convenio_id: string | null; contrato_id: string | null }>).forEach((a) => {
      if (a.convenio_id) out.set(a.id, { pago: true, motivo: "convenio" });
      else if (a.contrato_id) out.set(a.id, { pago: true, motivo: "cartao_beneficios" });
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
    case "convenio": return "Convênio";
    case "cartao_beneficios": return "Cartão benefícios";
    default: return "Pendente";
  }
}