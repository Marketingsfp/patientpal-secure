import { supabase } from "@/integrations/supabase/client";
import { logAction } from "@/hooks/use-crud";

/**
 * Para onde a saída de caixa foi, quando o caixa do pagamento original já
 * estava fechado. A devolução é dinheiro saindo de uma gaveta física, então
 * quem a recebe importa para a conferência do dia:
 *
 *   'lancado_no_caixa_de_quem_recebeu' — caso normal. Foi para o caixa aberto
 *       de quem recebeu o pagamento, que é a gaveta de onde o dinheiro sai.
 *   'lancado_em_sessao_atual' — exceção. Essa pessoa não tinha caixa aberto, e
 *       a saída foi para o caixa de quem executou o estorno (em geral o admin
 *       que aprovou a solicitação). Precisa ser dito na tela, senão ele fecha
 *       o dia com uma falta que não é dele.
 *
 * Sem nenhum dos dois, a saída caiu na própria sessão do recebimento, que
 * ainda estava aberta, e não há nada a avisar.
 */
export type EstornoAviso = "lancado_no_caixa_de_quem_recebeu" | "lancado_em_sessao_atual";

export type EstornoLancamentoResultado =
  | { ok: true; aviso?: EstornoAviso | string | null }
  /**
   * Recusa prevista pela regra de negócio — a mensagem já vem pronta do banco e
   * deve ser mostrada como aviso, não como erro técnico. Hoje: repasse já pago
   * e caixa de origem fechado sem nenhum caixa aberto para receber a saída.
   */
  | { ok: false; motivo: "bloqueado"; mensagem: string }
  | { ok: false; motivo: "erro"; mensagem: string; error: unknown };

/**
 * Rotina única de estorno de uma receita (fin_lancamentos): cancela o
 * lançamento, reverte o(s) recebimento(s) no caixa e reabre o que estava
 * vinculado (agendamento OU parcela de mensalidade de contrato).
 *
 * MED-16: as três etapas rodavam como chamadas client-side separadas — se a
 * última falhasse, o lançamento já tinha sido cancelado (commitado),
 * sobrando inconsistência entre "financeiro estornado" e "agendamento/
 * mensalidade ainda mostrado como pago". A reversão do caixa nem chegava a
 * virar aviso visível (só console.warn). Agora a RPC
 * estornar_lancamento_receita faz tudo numa única transação Postgres.
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
  const { data, error } = await supabase.rpc("estornar_lancamento_receita", {
    _lancamento_id: lancamentoId,
    _clinica_id: clinicaId ?? null,
  } as never);
  if (error) {
    return { ok: false, motivo: "erro", mensagem: "Falha ao estornar lançamento", error };
  }
  const resultado = (data ?? {}) as {
    ok: boolean;
    motivo?: string;
    mensagem?: string;
    aviso?: string | null;
    agendamento_id?: string | null;
    mensalidade_id?: string | null;
    valor?: number | null;
  };
  if (!resultado.ok) {
    return {
      ok: false,
      motivo: "bloqueado",
      mensagem: resultado.mensagem ?? "Não foi possível estornar este lançamento.",
    };
  }

  // Auditoria best-effort — a transação já commitou; uma falha aqui não
  // desfaz nem bloqueia o resultado do estorno.
  try {
    if (resultado.agendamento_id) {
      await logAction({
        table_name: "agendamentos",
        record_id: resultado.agendamento_id,
        action: "ESTORNO",
        clinica_id: clinicaId,
        dados_depois: {
          id: resultado.agendamento_id,
          status: "agendado",
          fin_lancamentos_id_removido: lancamentoId,
          valor_estornado: resultado.valor ?? null,
        },
      });
    } else {
      await logAction({
        table_name: "fin_lancamentos",
        record_id: lancamentoId,
        action: "ESTORNO",
        clinica_id: clinicaId,
        dados_depois: {
          id: lancamentoId,
          status: "cancelado",
          valor_estornado: resultado.valor ?? null,
          mensalidade_revertida: resultado.mensalidade_id ?? null,
        },
      });
    }
  } catch {
    /* auditoria best-effort */
  }

  return { ok: true, aviso: resultado.aviso ?? null };
}
