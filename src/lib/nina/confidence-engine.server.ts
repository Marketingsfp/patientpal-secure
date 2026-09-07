/**
 * NINA CONFIDENCE DECISION ENGINE — persistência (server-only).
 *
 * Best-effort: auditoria nunca derruba um atendimento. Vale igual para o
 * atendimento real e para a homologação (mesma regra, mesmo registro; muda
 * apenas o campo `ambiente`).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DecisaoConfianca } from "./confidence-engine";

export async function registrarDecisaoConfianca(params: {
  clinicaId: string;
  conversaId: string | null;
  execucaoId: string | null;
  traceId?: string | null;
  teste: boolean;
  decisao: DecisaoConfianca;
}): Promise<void> {
  try {
    await supabaseAdmin.from("nina_confianca_decisoes").insert({
      clinica_id: params.clinicaId,
      conversation_id: params.conversaId,
      execucao_id: params.execucaoId,
      trace_id: params.traceId ?? null,
      ambiente: params.teste ? "homologacao" : "producao",
      score: params.decisao.score,
      acao: params.decisao.acao,
      bloqueio: params.decisao.bloqueio,
      categorias: params.decisao.categorias,
      motivos: params.decisao.motivos,
    } as never);
  } catch (e) {
    console.warn("[nina-confianca] falha ao registrar decisão:", e instanceof Error ? e.message : e);
  }
}
