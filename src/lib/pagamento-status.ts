import { supabase } from "@/integrations/supabase/client";

export type MotivoPago = "caixa" | "orcamento" | null;
export type StatusPagamento = {
  pago: boolean;
  motivo: MotivoPago;
  /**
   * Momento em que o pagamento foi confirmado (ISO). É a hora em que o caixa
   * registrou o recebimento — ou em que o item do orçamento foi vinculado.
   * A fila do médico usa isso para ordenar quem chega: quem pagou antes é
   * chamado antes. Fica `null` enquanto não há pagamento.
   */
  em: string | null;
};

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
  ids.forEach((id) => out.set(id, { pago: false, motivo: null, em: null }));

  // 1) lançamentos de receita
  // ALTA-10: sem o filtro de status, um lançamento estornado
  // (status='cancelado', nunca apagado — ver estornar-lancamento.ts) ainda
  // contava como "pago", travando o atendimento em "pago" para sempre
  // mesmo depois de um estorno legítimo.
  const { data: lancs } = await supabase
    .from("fin_lancamentos")
    .select("agendamento_id, created_at")
    .eq("tipo", "receita")
    .eq("status", "confirmado")
    .in("agendamento_id", ids);
  ((lancs ?? []) as Array<{ agendamento_id: string | null; created_at: string | null }>).forEach(
    (r) => {
      if (!r.agendamento_id) return;
      // Um atendimento pode ter mais de um recebimento (pagamento dividido).
      // Vale o primeiro: é ele que marca a hora em que o paciente entrou na
      // fila de quem já pagou.
      const atual = out.get(r.agendamento_id);
      const em = r.created_at ?? null;
      if (atual?.pago && atual.em && em && atual.em <= em) return;
      out.set(r.agendamento_id, { pago: true, motivo: "caixa", em });
    },
  );

  // 2) itens de orçamento vinculados
  const faltam = ids.filter((id) => !out.get(id)?.pago);
  if (faltam.length) {
    const { data: orcItens } = await supabase
      .from("agendamento_orcamento_itens")
      .select("agendamento_id, created_at")
      .in("agendamento_id", faltam);
    (
      (orcItens ?? []) as Array<{ agendamento_id: string | null; created_at: string | null }>
    ).forEach((r) => {
      if (!r.agendamento_id) return;
      const atual = out.get(r.agendamento_id);
      const em = r.created_at ?? null;
      if (atual?.pago && atual.em && em && atual.em <= em) return;
      out.set(r.agendamento_id, { pago: true, motivo: "orcamento", em });
    });
  }

  return out;
}

export async function agendamentoStatusPagamento(id: string): Promise<StatusPagamento> {
  const map = await agendamentosStatusPagamento([id]);
  return map.get(id) ?? { pago: false, motivo: null, em: null };
}

export function rotuloMotivoPago(m: MotivoPago): string {
  switch (m) {
    case "caixa":
      return "Pago no caixa";
    case "orcamento":
      return "Orçamento pago";
    default:
      return "Pendente";
  }
}
