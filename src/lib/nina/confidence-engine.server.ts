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
import { VERSAO_MOTOR, VERSAO_POLITICA } from "./confidence/policy";

/**
 * FASE 6 — liga o snapshot já gravado à mensagem da Nina que foi de fato
 * enviada. O vínculo principal do indicador é `outgoing_message_id`; a
 * execução continua guardada para o histórico e para os reportes de erro.
 */
export async function vincularSnapshotMensagemEnviada(params: {
  clinicaId: string;
  execucaoId: string | null | undefined;
  outgoingMessageId: string | null | undefined;
}): Promise<void> {
  if (!params.execucaoId || !params.outgoingMessageId) return;
  try {
    await supabaseAdmin
      .from("nina_confianca_decisoes")
      .update({ outgoing_message_id: params.outgoingMessageId } as never)
      .eq("clinica_id", params.clinicaId)
      .eq("execucao_id", params.execucaoId)
      .eq("avaliacao", "answer_confidence")
      .is("outgoing_message_id", null);
  } catch (e) {
    console.warn("[nina-confianca] falha ao vincular mensagem enviada:", e instanceof Error ? e.message : e);
  }
}

export async function registrarDecisaoConfianca(params: {
  clinicaId: string;
  conversaId: string | null;
  execucaoId: string | null;
  traceId?: string | null;
  teste: boolean;
  /**
   * FASE 4 — ambiente explícito. Quando não informado, cai na regra antiga
   * (teste ⇒ homologação). O Test Runner informa "teste_automatizado" para
   * que métricas reais nunca recebam execuções automatizadas.
   */
  ambiente?: import("./confianca-execucao").AmbienteQA;
  decisao: DecisaoConfianca;
  /** Registro explicável da Fase 5 (opcional para chamadas antigas). */
  auditoria?: RegistroAuditoriaConfianca | null;
  /** Fase 7: "shadow" (só observa) ou "enforce" (decide). */
  modo?: "shadow" | "enforce";
  /** Fase 7: o motor teria liberado a resposta/ação? */
  teriaPermitido?: boolean;
  /** Versão da política usada nesta avaliação (imutável no histórico). */
  policyVersion?: string;
  /**
   * FASE 5 — o que este registro avalia:
   * - `action_safety`: era seguro executar a ação (padrão histórico);
   * - `answer_confidence`: a mensagem final realmente enviada ao paciente.
   */
  avaliacao?: "action_safety" | "answer_confidence";
  /** FASE 5 — impressão digital do texto avaliado (gate de saída). */
  textoFinalHash?: string | null;
  /** FASE 5 — grounding afirmação a afirmação da resposta final. */
  claims?: unknown;
  /** FASE 6 — mensagem da Nina efetivamente enviada (vínculo principal). */
  outgoingMessageId?: string | null;
  /** FASE 6 — sessão da Nina que produziu a resposta. */
  ninaSessionId?: string | null;
  /** FASE 6 — versão do motor de confiança. */
  engineVersion?: string;
  /**
   * FASE 5 — telemetria da política de handoff (sem dado sensível):
   * o que foi decidido, por quê, e se o turno virou transferência.
   */
  handoffDecision?: string | null;
  handoffReason?: string | null;
  handoffOcorreu?: boolean | null;
}): Promise<void> {
  try {
    const a = params.auditoria ?? null;
    await supabaseAdmin.from("nina_confianca_decisoes").insert({
      clinica_id: params.clinicaId,
      conversation_id: params.conversaId ?? a?.conversationId ?? null,
      execucao_id: params.execucaoId,
      trace_id: params.traceId ?? null,
      ambiente: params.ambiente ?? (params.teste ? "homologacao" : "producao"),
      score: params.decisao.score,
      acao: params.decisao.acao,
      bloqueio: params.decisao.bloqueio,
      categorias: params.decisao.categorias,
      motivos: params.decisao.motivos,
      modo: params.modo ?? "shadow",
      teria_permitido: params.teriaPermitido ?? null,
      policy_version: params.policyVersion ?? VERSAO_POLITICA,
      engine_version: params.engineVersion ?? VERSAO_MOTOR,
      outgoing_message_id: params.outgoingMessageId ?? a?.outgoingMessageId ?? null,
      nina_session_id: params.ninaSessionId ?? a?.ninaSessionId ?? null,
      avaliacao: params.avaliacao ?? "action_safety",
      texto_final_hash: params.textoFinalHash ?? null,
      handoff_decision: params.handoffDecision ?? null,
      handoff_reason: params.handoffReason ?? null,
      handoff_ocorreu: params.handoffOcorreu ?? null,
      claims: params.claims ?? null,
      ...(a
        ? {
            message_id: a.messageId,
            intencao: a.intencao,
            acao_solicitada: a.acaoSolicitada,
            // FASE 3 — o tipo do turno explica QUAIS critérios se aplicavam.
            turn_type: a.tipoTurno ?? null,

            nivel: a.nivel,
            decisao: a.decisao,
            validadores: a.validadores,
            reason_codes: a.reasonCodes,
            fontes: a.fontes,
            ferramentas: a.ferramentas,
            bloqueadores: a.bloqueadores,
            resultado_final: a.resultadoFinal,
            // FASE 6 — cobertura e conflitos auditáveis junto do snapshot.
            evidence_coverage: a.evidenceCoverage ?? null,
            conflitos: a.validadores.flatMap((v) =>
              (v.conflitos ?? []).map((c) => ({ validator: v.validator, ...c })),
            ),
          }
        : {}),
    } as never);
  } catch (e) {
    console.warn("[nina-confianca] falha ao registrar decisão:", e instanceof Error ? e.message : e);
  }
}
