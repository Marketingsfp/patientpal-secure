/**
 * FASE 5 — registro e leitura das decisões humanas (servidor).
 *
 * Nada aqui altera catálogo, prompt, ferramentas, modelo ou atendimento.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MSG_CONFLITO, VALORES_DECISAO, type TipoDecisao } from "@/lib/nina/decisoes";

type ClienteRpc = {
  rpc: (
    fn: "nina_fb_pode_revisar",
    args: { _user_id: string; _clinica_id: string },
  ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
};

export async function assertRevisorFeedback(
  supabase: unknown,
  userId: string,
  clinicaId: string,
) {
  const { data, error } = await (supabase as ClienteRpc).rpc("nina_fb_pode_revisar", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Somente supervisão, gestão ou administração pode revisar.");
}

export type Decisao = {
  id: string;
  feedback_id: string;
  tipo: TipoDecisao;
  status_antes: string | null;
  status_depois: string | null;
  causa_antes: string | null;
  causa_depois: string | null;
  observacao: string | null;
  analise_versao: number | null;
  autor: string;
  created_at: string;
};

const COLUNAS =
  "id, feedback_id, tipo, status_antes, status_depois, causa_antes, causa_depois, observacao, analise_versao, autor, created_at";

/** Grava a decisão no histórico de auditoria. Falha fechada: erro aqui é erro da ação. */
export async function registrarDecisao(
  supabase: unknown,
  entrada: {
    clinicaId: string;
    feedbackId: string;
    tipo: TipoDecisao;
    autor: string;
    statusAntes?: string | null;
    statusDepois?: string | null;
    causaAntes?: string | null;
    causaDepois?: string | null;
    observacao?: string | null;
    analiseId?: string | null;
    analiseVersao?: number | null;
  },
) {
  const { error } = await (supabase as { from: (t: string) => any })
    .from("nina_feedback_decisoes")
    .insert({
      clinica_id: entrada.clinicaId,
      feedback_id: entrada.feedbackId,
      tipo: entrada.tipo,
      status_antes: entrada.statusAntes ?? null,
      status_depois: entrada.statusDepois ?? null,
      causa_antes: entrada.causaAntes ?? null,
      causa_depois: entrada.causaDepois ?? null,
      observacao: entrada.observacao?.slice(0, 2000) ?? null,
      analise_id: entrada.analiseId ?? null,
      analise_versao: entrada.analiseVersao ?? null,
      autor: entrada.autor,
    });
  if (error) throw new Error(`Decisão não registrada na auditoria: ${error.message}`);
}

export const listarDecisoesFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), feedbackId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisorFeedback(context.supabase, context.userId, data.clinicaId);
    const { data: linhas, error } = await (context.supabase as any)
      .from("nina_feedback_decisoes")
      .select(COLUNAS)
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (linhas ?? []) as Decisao[];
  });

/**
 * Confirma o problema ou marca falso positivo. É uma decisão de diagnóstico —
 * NÃO aprova correção e NÃO aplica nada.
 */
export const decidirProblemaFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid(),
        decisao: z.enum(["problema_confirmado", "falso_positivo"]),
        observacao: z.string().trim().max(2000).nullish(),
        esperadoUpdatedAt: z.string().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisorFeedback(context.supabase, context.userId, data.clinicaId);
    const supabase = context.supabase as any;

    const { data: atual, error: eAtual } = await supabase
      .from("nina_feedback_erros")
      .select("id, status, root_cause, updated_at")
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (eAtual) throw new Error(eAtual.message);
    if (!atual) throw new Error("Erro reportado não encontrado nesta clínica.");
    if (data.esperadoUpdatedAt && atual.updated_at !== data.esperadoUpdatedAt) {
      throw new Error(MSG_CONFLITO);
    }

    const falso = data.decisao === "falso_positivo";
    let q = supabase
      .from("nina_feedback_erros")
      .update({
        decisao_humana: data.decisao,
        decidido_por: context.userId,
        decidido_em: new Date().toISOString(),
        ...(falso
          ? {
              status: "rejected",
              motivo_rejeicao: data.observacao?.trim() || "Falso positivo: a resposta estava adequada.",
              revisado_por: context.userId,
              revisado_em: new Date().toISOString(),
            }
          : {}),
      })
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId);
    if (data.esperadoUpdatedAt) q = q.eq("updated_at", data.esperadoUpdatedAt);

    const { data: linha, error } = await q.select("id, status, updated_at").maybeSingle();
    if (error) throw new Error(error.message);
    if (!linha) throw new Error(MSG_CONFLITO);

    await registrarDecisao(context.supabase, {
      clinicaId: data.clinicaId,
      feedbackId: data.id,
      tipo: data.decisao,
      autor: context.userId,
      statusAntes: atual.status,
      statusDepois: linha.status,
      causaAntes: atual.root_cause,
      causaDepois: atual.root_cause,
      observacao: data.observacao ?? null,
    });

    return linha as { id: string; status: string; updated_at: string };
  });

/** Registra que a sugestão da IA foi copiada para o rascunho (ação explícita). */
export const registrarUsoRascunhoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        id: z.string().uuid(),
        analiseId: z.string().uuid().nullish(),
        analiseVersao: z.number().int().nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisorFeedback(context.supabase, context.userId, data.clinicaId);
    await registrarDecisao(context.supabase, {
      clinicaId: data.clinicaId,
      feedbackId: data.id,
      tipo: "rascunho_ia_usado" as TipoDecisao,
      autor: context.userId,
      analiseId: data.analiseId ?? null,
      analiseVersao: data.analiseVersao ?? null,
      observacao: "Sugestão da análise copiada para o rascunho de correção.",
    });
    return { ok: true as const };
  });

export const VALORES_DECISAO_EXPORT = VALORES_DECISAO;
