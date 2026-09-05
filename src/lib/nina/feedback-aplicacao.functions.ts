/**
 * FASE 4 — Aplicação controlada das correções aprovadas (servidor).
 *
 * Garantias desta camada:
 *  - a correção é direcionada para a camada responsável pelo erro;
 *  - nenhuma escrita direta em `nina_kb_registros` (fonte oficial derivada da
 *    planilha enviada) — não existe base paralela;
 *  - correção de planilha só marca `applied` depois que a versão ativa da Base
 *    realmente passa a conter a informação corrigida (verificação por consulta);
 *  - correções técnicas (busca, prompt, ferramenta, fluxo) geram uma ação
 *    rastreável e só marcam `applied` quando a ação é concluída por pessoa
 *    autorizada;
 *  - a Nina nunca altera o próprio prompt: só há registro de ação técnica.
 *
 * Permissão: admin, gestor ou supervisor da clínica (nina_fb_pode_revisar).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { baseJaContem, planoParaCausa } from "@/lib/nina/feedback-aplicacao";

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
  if (!data) throw new Error("Somente supervisão, gestão ou administração pode aplicar correções.");
}

const COLUNAS_FB =
  "id, clinica_id, categoria, correcao, pergunta_texto, mensagem_texto, status, root_cause, prioridade, knowledge_status";

async function lerBase(clinicaId: string, termo: string) {
  const { searchKnowledgeBase } = await import("@/lib/nina/knowledge.server");
  const kb = await searchKnowledgeBase({
    clinicaId,
    query: termo.slice(0, 200),
    canal: "aplicacao-aprendizado",
  });
  const resumo = [
    kb.procedure ? `Item: ${kb.procedure}` : null,
    kb.price ? `Valor: ${kb.price}` : null,
    kb.doctors.length ? `Médicos: ${kb.doctors.join(", ")}` : null,
    kb.units.length ? `Unidades: ${kb.units.join(", ")}` : null,
    kb.days.length ? `Dias: ${kb.days.join(", ")}` : null,
    kb.notes.length ? `Observações: ${kb.notes.slice(0, 3).join(" | ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { kb, resumo: resumo || null };
}

/** Mostra "Atual x Novo" e o plano de correção antes de qualquer aplicação. */
export const prepararAplicacaoFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), clinicaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);

    const { data: fb, error } = await context.supabase
      .from("nina_feedback_erros")
      .select(COLUNAS_FB)
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .single();
    if (error) throw new Error(error.message);
    if (!fb.root_cause)
      throw new Error("Diagnostique a causa do erro (Fase 3) antes de aplicar a correção.");
    if (fb.status !== "approved" && fb.status !== "applied")
      throw new Error("Só é possível aplicar correções de feedbacks aprovados.");

    const plano = planoParaCausa(fb.root_cause);
    if (!plano) throw new Error("Causa sem plano de correção definido.");

    const termo = String(fb.pergunta_texto ?? fb.correcao ?? "");
    const { kb, resumo } = await lerBase(data.clinicaId, termo);
    const jaNaBase = baseJaContem(resumo, fb.correcao);

    const { data: acoes } = await context.supabase
      .from("nina_feedback_acoes")
      .select("id, tipo, camada, titulo, instrucao, status, created_at, concluido_em")
      .eq("feedback_id", data.id)
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false });

    return {
      plano,
      atual: resumo,
      novo: fb.correcao as string,
      knowledge_status: kb.knowledge_status,
      base_version: kb.base_version,
      base_file: kb.base_file,
      ja_na_base: jaNaBase,
      status: fb.status as string,
      acoes: acoes ?? [],
    };
  });

const aplicarSchema = z.object({
  id: z.string().uuid(),
  clinicaId: z.string().uuid(),
  confirmado: z.literal(true),
  observacao: z.string().trim().max(4000).nullish(),
  reindexar: z.boolean().optional(),
});

/**
 * Aplica a correção aprovada na camada correta.
 *  - planilha: verifica a versão ativa; se a correção ainda não estiver lá,
 *    registra a pendência de reenviar a planilha e NÃO marca como aplicado;
 *  - demais camadas: registra a ação técnica; a conclusão marca `applied`.
 */
export const aplicarFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => aplicarSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);

    const { data: fb, error } = await context.supabase
      .from("nina_feedback_erros")
      .select(COLUNAS_FB)
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .single();
    if (error) throw new Error(error.message);
    if (fb.status !== "approved")
      throw new Error("Só é possível aplicar correções de feedbacks aprovados.");
    const plano = planoParaCausa(fb.root_cause);
    if (!plano) throw new Error("Diagnostique a causa do erro antes de aplicar a correção.");

    const termo = String(fb.pergunta_texto ?? fb.correcao ?? "");
    const { kb, resumo } = await lerBase(data.clinicaId, termo);
    const jaNaBase = baseJaContem(resumo, fb.correcao);
    const agora = new Date().toISOString();

    // Reindexação: refaz chunks/embeddings/índices a partir do arquivo oficial
    // da versão ATIVA. Nunca inventa conteúdo nem grava registro à mão.
    let reindexado: { ok: boolean; detalhe: string } | null = null;
    if (data.reindexar && plano.permiteReindexar) {
      const { baseAtiva, processarBase, invalidarCache } = await import("@/lib/nina/kb.server");
      const base = await baseAtiva(data.clinicaId);
      if (!base) {
        reindexado = { ok: false, detalhe: "Nenhuma versão ativa da Base para reprocessar." };
      } else {
        const r = await processarBase(base.id);
        invalidarCache(data.clinicaId);
        reindexado = {
          ok: Boolean((r as { ok?: boolean }).ok ?? true),
          detalhe: `Versão ${base.versao} reprocessada (chunks, embeddings e índices).`,
        };
      }
    }

    const evidencia = {
      knowledge_status: kb.knowledge_status,
      base_version: kb.base_version,
      base_file: kb.base_file,
      resumo_base: resumo,
      correcao: fb.correcao,
      ja_na_base: jaNaBase,
      reindexado,
      verificado_em: agora,
    };

    const aplicaAgora = plano.camada === "planilha" ? jaNaBase : false;

    // Ação rastreável (aberta quando ainda depende de trabalho humano/técnico).
    const { data: acao, error: erroAcao } = await context.supabase
      .from("nina_feedback_acoes")
      .insert({
        clinica_id: data.clinicaId,
        feedback_id: data.id,
        root_cause: fb.root_cause as string,
        camada: plano.camada,
        tipo: plano.tipo,
        titulo: plano.titulo,
        instrucao: plano.instrucao,
        valor_atual: resumo,
        valor_novo: fb.correcao,
        status: aplicaAgora ? "done" : "open",
        evidencia,
        observacao: data.observacao?.trim() || null,
        criado_por: context.userId,
        concluido_por: aplicaAgora ? context.userId : null,
        concluido_em: aplicaAgora ? agora : null,
      })
      .select("id, status, tipo, camada, titulo, instrucao")
      .single();
    if (erroAcao) throw new Error(erroAcao.message);

    if (aplicaAgora) {
      const { error: erroFb } = await context.supabase
        .from("nina_feedback_erros")
        .update({
          status: "applied",
          aplicacao_tipo: plano.tipo,
          aplicacao_resumo: plano.titulo,
          aplicacao_evidencia: evidencia,
          aplicado_por: context.userId,
          aplicado_em: agora,
        })
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId);
      if (erroFb) throw new Error(erroFb.message);
    }

    const pendencia = aplicaAgora
      ? null
      : plano.camada === "planilha"
        ? "A versão ativa da Base ainda não contém a informação corrigida. Corrija o arquivo oficial e reenvie uma nova versão pela Base de Conhecimentos; depois volte aqui e conclua a ação."
        : "Ação técnica registrada. Conclua a ação depois que a correção for feita na camada indicada.";

    return { aplicado: aplicaAgora, acao, pendencia, evidencia };
  });

/** Conclui (ou cancela) a ação técnica. Concluir marca o feedback como aplicado. */
export const concluirAcaoFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        acaoId: z.string().uuid(),
        clinicaId: z.string().uuid(),
        resultado: z.enum(["done", "canceled"]),
        observacao: z.string().trim().max(4000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);
    const agora = new Date().toISOString();

    const { data: acao, error } = await context.supabase
      .from("nina_feedback_acoes")
      .update({
        status: data.resultado,
        observacao: data.observacao?.trim() || null,
        concluido_por: context.userId,
        concluido_em: agora,
      })
      .eq("id", data.acaoId)
      .eq("clinica_id", data.clinicaId)
      .select("id, feedback_id, tipo, camada, titulo, status")
      .single();
    if (error) throw new Error(error.message);

    if (data.resultado === "done") {
      const { error: erroFb } = await context.supabase
        .from("nina_feedback_erros")
        .update({
          status: "applied",
          aplicacao_tipo: acao.tipo,
          aplicacao_resumo: acao.titulo,
          aplicado_por: context.userId,
          aplicado_em: agora,
        })
        .eq("id", acao.feedback_id)
        .eq("clinica_id", data.clinicaId);
      if (erroFb) throw new Error(erroFb.message);
    }
    return acao;
  });

/** Lista as ações de correção da clínica (para acompanhamento). */
export const listarAcoesFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        status: z.enum(["open", "done", "canceled", "todos"]).default("open"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nina_feedback_acoes")
      .select(
        "id, feedback_id, root_cause, camada, tipo, titulo, instrucao, valor_atual, valor_novo, status, observacao, created_at, concluido_em",
      )
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "todos") q = q.eq("status", data.status);
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    return linhas ?? [];
  });
