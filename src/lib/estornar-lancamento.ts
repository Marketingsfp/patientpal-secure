import { supabase } from "@/integrations/supabase/client";
import { logAction } from "@/hooks/use-crud";

export type EstornoLancamentoResultado =
  | { ok: true }
  | { ok: false; motivo: "repasse_pago"; mensagem: string }
  | { ok: false; motivo: "erro"; mensagem: string; error: unknown };

/**
 * Rotina única de estorno de uma receita (fin_lancamentos): cancela o
 * lançamento, reverte o(s) recebimento(s) no caixa e reabre o que estava
 * vinculado (agendamento OU parcela de mensalidade de contrato).
 *
 * Extraída de app.financeiro.estorno.tsx (fluxo de aprovação de estorno) para
 * ser reaproveitada também pelo botão "Reverter" de contrato_mensalidades —
 * antes esse botão só zerava os campos da mensalidade sem tocar no
 * lançamento nem no caixa, podendo deixar dinheiro confirmado no caixa com a
 * mensalidade "pendente", ou o caixa estornado com a mensalidade ainda paga.
 */
export async function estornarLancamentoReceita(
  lancamentoId: string,
  clinicaId?: string,
): Promise<EstornoLancamentoResultado> {
  const { data: lanc, error: eLanc } = await supabase
    .from("fin_lancamentos")
    .select("id, agendamento_id, valor, descricao, repasse_pago")
    .eq("id", lancamentoId)
    .maybeSingle();
  if (eLanc) return { ok: false, motivo: "erro", mensagem: "Falha ao buscar lançamento", error: eLanc };
  if (!lanc) return { ok: true };

  const { data: atd } = await supabase
    .from("fin_atendimentos")
    .select("id, repasse_pago")
    .eq("lancamento_id", lancamentoId)
    .maybeSingle();
  if (atd?.repasse_pago || (lanc as { repasse_pago?: boolean }).repasse_pago) {
    return {
      ok: false,
      motivo: "repasse_pago",
      mensagem: "Repasse já pago — estorne o pagamento do repasse primeiro.",
    };
  }

  // Não usamos DELETE: a policy fin_lanc_delete só permite admin/gestor —
  // para financeiro o DELETE não retorna erro mas afeta 0 linhas, deixando o
  // pagamento "vivo". status='cancelado' é o que o resto do sistema filtra.
  const { error: eUpdLanc } = await supabase
    .from("fin_lancamentos")
    .update({ status: "cancelado" } as never)
    .eq("id", lanc.id);
  if (eUpdLanc) return { ok: false, motivo: "erro", mensagem: "Falha ao estornar lançamento", error: eUpdLanc };

  // Reverte o(s) recebimento(s) de caixa vinculados, inserindo uma sangria
  // na MESMA sessão do recebimento original — sem isso o saldo do caixa
  // continuaria refletindo dinheiro que não existe mais.
  try {
    const { data: recebs } = await supabase
      .from("caixa_movimentos")
      .select("id, sessao_id, clinica_id, user_id, valor, descricao, forma_pagamento, lancamento_id")
      .eq("lancamento_id", lanc.id)
      .eq("tipo", "recebimento");
    const recebRows = (recebs ?? []) as Array<{
      id: string;
      sessao_id: string;
      clinica_id: string;
      user_id: string;
      valor: number;
      descricao: string | null;
      forma_pagamento: string | null;
      lancamento_id: string | null;
    }>;
    if (recebRows.length > 0) {
      const { data: jaEstornados } = await supabase
        .from("caixa_movimentos")
        .select("sessao_id, lancamento_id, descricao, tipo")
        .eq("lancamento_id", lanc.id)
        .eq("tipo", "sangria");
      const chaveJa = new Set(
        ((jaEstornados ?? []) as Array<{ sessao_id: string; descricao: string | null }>)
          .filter((r) => (r.descricao ?? "").toLowerCase().startsWith("estorno"))
          .map((r) => r.sessao_id),
      );
      const paraInserir = recebRows
        .filter((r) => !chaveJa.has(r.sessao_id))
        .map((r) => ({
          sessao_id: r.sessao_id,
          clinica_id: r.clinica_id,
          user_id: r.user_id,
          tipo: "sangria" as const,
          valor: Number(r.valor || 0),
          descricao: `Estorno — ${r.descricao ?? ""}`.trim(),
          forma_pagamento: r.forma_pagamento,
          lancamento_id: r.lancamento_id,
        }));
      if (paraInserir.length > 0) {
        const { error: eRev } = await supabase.from("caixa_movimentos").insert(paraInserir as never);
        if (eRev) console.warn("Falha ao lançar sangria de estorno no caixa:", eRev);
      }
    }
  } catch (err) {
    console.warn("Reversão de caixa não pôde ser aplicada:", err);
  }

  const agId = lanc.agendamento_id;
  if (agId) {
    const { data: agAntes } = await supabase
      .from("agendamentos")
      .select("id, status, fluxo_etapa")
      .eq("id", agId)
      .maybeSingle();
    const { error: eUpd } = await supabase
      .from("agendamentos")
      .update({
        status: "agendado",
        fluxo_etapa: "aguardando_recepcao",
        fluxo_atualizado_em: new Date().toISOString(),
      } as never)
      .eq("id", agId);
    if (eUpd) return { ok: false, motivo: "erro", mensagem: "Falha ao reabrir agendamento", error: eUpd };
    try {
      await logAction({
        table_name: "agendamentos",
        record_id: agId,
        action: "ESTORNO",
        clinica_id: clinicaId,
        dados_antes: agAntes ?? { id: agId },
        dados_depois: {
          id: agId,
          status: "agendado",
          fin_lancamentos_id_removido: lanc.id,
          valor_estornado: lanc.valor ?? null,
        },
      });
    } catch {
      /* auditoria best-effort */
    }
  } else {
    const { data: mens } = await supabase
      .from("contrato_mensalidades")
      .select("id")
      .eq("lancamento_id", lanc.id)
      .maybeSingle();
    if (mens) {
      const { error: eMens } = await supabase
        .from("contrato_mensalidades")
        .update({
          status: "pendente",
          pago_em: null,
          forma_pagamento: null,
          valor_pago: null,
          lancamento_id: null,
        } as never)
        .eq("id", (mens as { id: string }).id);
      if (eMens) {
        return {
          ok: false,
          motivo: "erro",
          mensagem: "Lançamento estornado, mas falha ao reabrir a parcela da mensalidade",
          error: eMens,
        };
      }
    }
    try {
      await logAction({
        table_name: "fin_lancamentos",
        record_id: lanc.id,
        action: "ESTORNO",
        clinica_id: clinicaId,
        dados_antes: { id: lanc.id, status: "confirmado" },
        dados_depois: {
          id: lanc.id,
          status: "cancelado",
          valor_estornado: lanc.valor ?? null,
          mensalidade_revertida: (mens as { id: string } | null)?.id ?? null,
        },
      });
    } catch {
      /* auditoria best-effort */
    }
  }

  return { ok: true };
}
