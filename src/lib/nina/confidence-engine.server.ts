/**
 * NINA CONFIDENCE DECISION ENGINE — persistência (server-only).
 *
 * Best-effort: auditoria nunca derruba um atendimento. Vale igual para o
 * atendimento real e para a homologação (mesma regra, mesmo registro; muda
 * apenas o campo `ambiente`).
 *
 * FASE 5: além da decisão resumida, grava o registro explicável — validadores,
 * status, códigos de motivo, fontes, ferramentas e bloqueios. Nunca grava
 * rascunho de resposta nem raciocínio interno do modelo.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DecisaoConfianca } from "./confidence-engine";
import type { RegistroAuditoriaConfianca } from "./confidence/auditoria";

export async function registrarDecisaoConfianca(params: {
  clinicaId: string;
  conversaId: string | null;
  execucaoId: string | null;
  traceId?: string | null;
  teste: boolean;
  decisao: DecisaoConfianca;
  /** Registro explicável da Fase 5 (opcional para chamadas antigas). */
  auditoria?: RegistroAuditoriaConfianca | null;
}): Promise<void> {
  try {
    const a = params.auditoria ?? null;
    await supabaseAdmin.from("nina_confianca_decisoes").insert({
      clinica_id: params.clinicaId,
      conversation_id: params.conversaId ?? a?.conversationId ?? null,
      execucao_id: params.execucaoId,
      trace_id: params.traceId ?? null,
      ambiente: params.teste ? "homologacao" : "producao",
      score: params.decisao.score,
      acao: params.decisao.acao,
      bloqueio: params.decisao.bloqueio,
      categorias: params.decisao.categorias,
      motivos: params.decisao.motivos,
      ...(a
        ? {
            message_id: a.messageId,
            intencao: a.intencao,
            acao_solicitada: a.acaoSolicitada,
            nivel: a.nivel,
            decisao: a.decisao,
            validadores: a.validadores,
            reason_codes: a.reasonCodes,
            fontes: a.fontes,
            ferramentas: a.ferramentas,
            bloqueadores: a.bloqueadores,
            resultado_final: a.resultadoFinal,
          }
        : {}),
    } as never);
  } catch (e) {
    console.warn("[nina-confianca] falha ao registrar decisão:", e instanceof Error ? e.message : e);
  }
}
