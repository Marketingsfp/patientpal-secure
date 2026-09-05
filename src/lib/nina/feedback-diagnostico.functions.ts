/**
 * FASE 3 — Diagnóstico da causa real dos erros da Nina (servidor).
 *
 * O que estas funções fazem:
 *   1. consultam a Base de Conhecimentos (planilha oficial) para comparar
 *      "o que a planilha diz hoje" com "a correção sugerida";
 *   2. gravam a causa raiz, a prioridade e o agrupamento no próprio feedback.
 *
 * O que elas NÃO fazem (garantia da fase): não alteram planilha, Base de
 * Conhecimentos, embeddings, prompt, modelo, regras nem ferramentas. A consulta
 * é somente leitura.
 *
 * Permissão: somente admin, gestor ou supervisor da clínica (mesma regra da
 * revisão, validada no banco por nina_fb_pode_revisar).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  VALORES_CAUSA_RAIZ,
  VALORES_PRIORIDADE,
  assuntoSugerido,
  chaveAgrupamento,
  prioridadeSugerida,
  type CausaRaizNina,
} from "@/lib/nina/feedback-diagnostico";

type ClienteRpc = {
  rpc: (
    fn: "nina_fb_pode_revisar",
    args: { _user_id: string; _clinica_id: string },
  ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
};

async function assertRevisor(supabase: unknown, userId: string, clinicaId: string) {
  const { data, error } = await (supabase as ClienteRpc).rpc("nina_fb_pode_revisar", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Somente supervisão, gestão ou administração pode diagnosticar.");
}

function contem(alvo: string | null | undefined, trecho: string | null | undefined) {
  const a = String(alvo ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const b = String(trecho ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Compara a planilha oficial com a correção sugerida. Somente leitura.
 */
export const consultarBaseFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), clinicaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);

    const { data: fb, error } = await context.supabase
      .from("nina_feedback_erros")
      .select("id, categoria, pergunta_texto, mensagem_texto, correcao")
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .single();
    if (error) throw new Error(error.message);

    const termo = String(fb.pergunta_texto ?? fb.correcao ?? "").slice(0, 200);
    const { searchKnowledgeBase } = await import("@/lib/nina/knowledge.server");
    const kb = await searchKnowledgeBase({
      clinicaId: data.clinicaId,
      query: termo,
      canal: "revisao-aprendizado",
    });

    const planilhaResumo = [
      kb.procedure ? `Item: ${kb.procedure}` : null,
      kb.price ? `Valor: ${kb.price}` : null,
      kb.doctors.length ? `Médicos: ${kb.doctors.join(", ")}` : null,
      kb.units.length ? `Unidades: ${kb.units.join(", ")}` : null,
      kb.days.length ? `Dias: ${kb.days.join(", ")}` : null,
      kb.notes.length ? `Observações: ${kb.notes.slice(0, 3).join(" | ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Sugestão de causa — é só um ponto de partida, a supervisão decide.
    let causaSugerida: CausaRaizNina;
    if (kb.knowledge_status === "not_found") {
      causaSugerida = "knowledge_missing";
    } else if (kb.knowledge_status === "conflict") {
      causaSugerida = "knowledge_error";
    } else if (contem(planilhaResumo, fb.correcao)) {
      // A planilha já traz a informação correta → a falha foi da Nina.
      causaSugerida = "retrieval_error";
    } else {
      causaSugerida = "knowledge_error";
    }

    const assunto = assuntoSugerido(kb.procedure, fb.pergunta_texto ?? fb.correcao);

    return {
      knowledge_status: kb.knowledge_status,
      base_version: kb.base_version,
      base_file: kb.base_file,
      termo,
      planilha_atual: planilhaResumo || null,
      correcao_sugerida: fb.correcao ?? null,
      trace: kb.trace.slice(0, 5),
      causa_sugerida: causaSugerida,
      prioridade_sugerida: prioridadeSugerida(causaSugerida, fb.categoria),
      assunto_sugerido: assunto,
      snapshot: {
        knowledge_status: kb.knowledge_status,
        base_version: kb.base_version,
        base_file: kb.base_file,
        termo,
        resumo: planilhaResumo || null,
        trace: kb.trace.slice(0, 5),
        consultado_em: new Date().toISOString(),
      },
    };
  });

/** Grava causa raiz, prioridade, situação na Base e agrupamento. */
export const salvarDiagnosticoFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        clinicaId: z.string().uuid(),
        rootCause: z.enum(VALORES_CAUSA_RAIZ),
        prioridade: z.enum(VALORES_PRIORIDADE).nullish(),
        assunto: z.string().trim().min(2).max(160),
        knowledgeStatus: z.enum(["found", "not_found", "conflict"]).nullish(),
        snapshot: z.record(z.string(), z.unknown()).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);

    const { data: atual, error: e1 } = await context.supabase
      .from("nina_feedback_erros")
      .select("categoria")
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .single();
    if (e1) throw new Error(e1.message);

    const prioridade = data.prioridade ?? prioridadeSugerida(data.rootCause, atual.categoria);
    const grupoChave = chaveAgrupamento(atual.categoria, data.assunto);

    const patch: {
      root_cause: string;
      prioridade: string;
      grupo_chave: string;
      grupo_titulo: string;
      diagnosticado_por: string;
      diagnosticado_em: string;
      knowledge_status?: string;
      knowledge_snapshot?: unknown;
      knowledge_consultado_em?: string;
    } = {
      root_cause: data.rootCause,
      prioridade,
      grupo_chave: grupoChave,
      grupo_titulo: data.assunto,
      diagnosticado_por: context.userId,
      diagnosticado_em: new Date().toISOString(),
    };
    if (data.knowledgeStatus) patch.knowledge_status = data.knowledgeStatus;
    if (data.snapshot) {
      patch.knowledge_snapshot = data.snapshot;
      patch.knowledge_consultado_em = new Date().toISOString();
    }

    const { error } = await context.supabase
      .from("nina_feedback_erros")
      .update(patch as never)
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);

    // Quantas ocorrências do mesmo problema já existem (registros preservados).
    const { count } = await context.supabase
      .from("nina_feedback_erros")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", data.clinicaId)
      .eq("grupo_chave", grupoChave);

    return { ok: true, grupoChave, grupoTitulo: data.assunto, prioridade, ocorrencias: count ?? 1 };
  });
