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

/**
 * Reporte rápido (um clique) de erro em uma mensagem da Nina — FASE 1.
 *
 * Reutiliza a mesma fila (`nina_feedback_erros`) e a mesma aba de Revisão de
 * aprendizados. Não exige motivo, categoria detalhada, observação ou correção:
 * entra como "Erro reportado — a classificar", com status `pending`.
 *
 * Validações no servidor: acesso à clínica, leitura da conversa pela RLS do
 * próprio usuário, mensagem pertencente à conversa e enviada pela Nina.
 * O conteúdo gravado é o texto armazenado no sistema — nunca o texto vindo do
 * frontend — preservado sem resumo, correção ou alteração de quebras de linha.
 */
export const reportarErroRapidoMensagemNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        mensagemId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { validarMensagemNina, montarRegistroErroRapido, ehConflitoDuplicidade, ORIGEM_ERRO_RAPIDO } =
      await import("@/lib/nina/erro-rapido");

    const { data: membro, error: erroMembro } = await context.supabase.rpc("is_member", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (erroMembro) throw new Error(erroMembro.message);
    if (!membro) throw new Error("Sem acesso a esta clínica");

    // A conversa é lida com a RLS do próprio usuário: quem não pode vê-la
    // simplesmente não encontra a mensagem.
    const { data: conversa, error: erroConversa } = await context.supabase
      .from("atend_conversas")
      .select("id")
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (erroConversa) throw new Error(erroConversa.message);
    if (!conversa) throw new Error("Conversa não encontrada ou sem permissão de acesso.");

    const { data: mensagem, error: erroMensagem } = await context.supabase
      .from("whatsapp_mensagens")
      .select("id, conversa_id, clinica_id, direction, enviada_por, body, transcricao")
      .eq("id", data.mensagemId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (erroMensagem) throw new Error(erroMensagem.message);

    const validacao = validarMensagemNina(mensagem as never, data.conversaId);
    if (!validacao.ok) throw new Error(validacao.mensagem);

    const colunas = "id, status, categoria, origem, created_at, mensagem_id, conversa_id";

    // 1ª barreira: já existe reporte rápido pendente para esta mensagem.
    const { data: existente } = await context.supabase
      .from("nina_feedback_erros")
      .select(colunas)
      .eq("clinica_id", data.clinicaId)
      .eq("mensagem_id", data.mensagemId)
      .eq("origem", ORIGEM_ERRO_RAPIDO)
      .eq("status", "pending")
      .maybeSingle();
    if (existente) return { ...existente, duplicado: true };

    const { data: linha, error } = await context.supabase
      .from("nina_feedback_erros")
      .insert(
        montarRegistroErroRapido({
          clinicaId: data.clinicaId,
          conversaId: data.conversaId,
          mensagemId: data.mensagemId,
          snapshot: validacao.snapshot,
          reporterUserId: context.userId,
        }) as never,
      )
      .select(colunas)
      .single();

    if (error) {
      // 2ª barreira (concorrência / duplo clique): índice único parcial no banco.
      if (ehConflitoDuplicidade(error)) {
        const { data: jaExiste } = await context.supabase
          .from("nina_feedback_erros")
          .select(colunas)
          .eq("clinica_id", data.clinicaId)
          .eq("mensagem_id", data.mensagemId)
          .eq("origem", ORIGEM_ERRO_RAPIDO)
          .eq("status", "pending")
          .maybeSingle();
        if (jaExiste) return { ...jaExiste, duplicado: true };
      }
      throw new Error(error.message);
    }
    return { ...linha, duplicado: false };
  });
