/**
 * Feedback de erros da Nina — acesso a dados (FASE 1).
 *
 * Só grava o feedback estruturado em `nina_feedback_erros` com status
 * `pending`. NÃO altera Base de Conhecimentos, planilha, embeddings, prompt,
 * modelo, regras ou ferramentas — e não interrompe a conversa em andamento.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VALORES_CATEGORIA_FEEDBACK } from "@/lib/nina/feedback-erros";

const schema = z.object({
  clinicaId: z.string().uuid(),
  conversaId: z.string().uuid().nullish(),
  mensagemId: z.string().uuid().nullish(),
  mensagemTexto: z.string().max(8000).nullish(),
  perguntaTexto: z.string().max(8000).nullish(),
  categoria: z.enum(VALORES_CATEGORIA_FEEDBACK),
  correcao: z.string().trim().min(3, "Descreva qual seria a informação correta.").max(4000),
  observacao: z.string().trim().max(4000).nullish(),
});

export const registrarFeedbackErroNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: membro, error: erroMembro } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (erroMembro) throw new Error(erroMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    const { data: linha, error } = await context.supabase
      .from("nina_feedback_erros")
      .insert({
        clinica_id: data.clinicaId,
        conversa_id: data.conversaId ?? null,
        mensagem_id: data.mensagemId ?? null,
        mensagem_texto: data.mensagemTexto ?? null,
        pergunta_texto: data.perguntaTexto ?? null,
        categoria: data.categoria,
        correcao: data.correcao,
        observacao: data.observacao?.trim() ? data.observacao.trim() : null,
        status: "pending",
        reportado_por: context.userId,
      })
      .select("id, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return linha;
  });

/** Lista somente leitura — apoio interno. Não há fluxo de aprovação nesta fase. */
export const listarFeedbacksErroNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid().nullish() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nina_feedback_erros")
      .select(
        "id, conversa_id, mensagem_id, categoria, correcao, observacao, status, reportado_por, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.conversaId) q = q.eq("conversa_id", data.conversaId);
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    return linhas ?? [];
  });
