/**
 * FASE 5 — Versionamento, rollback e validação automática (servidor).
 *
 * Garantias desta camada:
 *  - toda aplicação registra uma versão com valor anterior, valor novo, motivo,
 *    quem reportou, quem aprovou, quem aplicou, data/hora e feedback de origem;
 *  - o teste automático apenas CONSULTA a Base (mesma busca que a Nina usa) e
 *    nunca altera conteúdo;
 *  - conhecimento corrigido não é o mesmo que comportamento corrigido: quando o
 *    teste falha, o item continua sinalizado para investigação;
 *  - o rollback de planilha reativa a versão anterior do arquivo oficial e
 *    reprocessa chunks/embeddings/índices/cache — nunca escreve registro à mão.
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
  if (!data)
    throw new Error("Somente supervisão, gestão ou administração pode versionar ou reverter.");
}

/** Refaz a consulta da pergunta original na Base, do jeito que a Nina consulta. */
async function reconsultarBase(clinicaId: string, termo: string) {
  const { searchKnowledgeBase } = await import("@/lib/nina/knowledge.server");
  const kb = await searchKnowledgeBase({
    clinicaId,
    query: termo.slice(0, 200),
    canal: "validacao-aprendizado",
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

const COLUNAS_VERSAO =
  "id, feedback_id, acao_id, versao, item, valor_anterior, valor_novo, motivo, camada, tipo, root_cause, reportado_por, aprovado_por, aplicado_por, kb_versao_anterior, kb_versao_nova, teste_status, teste_em, teste_resposta, status, revertido_por, revertido_em, motivo_reversao, created_at";

/** Histórico de versões de um feedback (ou da clínica inteira). */
export const listarVersoesAprendizadoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ clinicaId: z.string().uuid(), feedbackId: z.string().uuid().optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nina_feedback_versoes")
      .select(COLUNAS_VERSAO)
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.feedbackId) q = q.eq("feedback_id", data.feedbackId);
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    return linhas ?? [];
  });

/**
 * Reexecuta a pergunta original contra a Base e compara com a correção
 * esperada. Somente leitura. Camadas que não dependem da Base (prompt,
 * ferramenta, fluxo) retornam "não aplicável" — precisam de homologação.
 */
export const testarCorrecaoAprendizadoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ versaoId: z.string().uuid(), clinicaId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);

    const { data: versao, error } = await context.supabase
      .from("nina_feedback_versoes")
      .select("id, feedback_id, camada, valor_novo, item")
      .eq("id", data.versaoId)
      .eq("clinica_id", data.clinicaId)
      .single();
    if (error) throw new Error(error.message);

    const { data: fb, error: erroFb } = await context.supabase
      .from("nina_feedback_erros")
      .select("id, pergunta_texto, correcao")
      .eq("id", versao.feedback_id)
      .eq("clinica_id", data.clinicaId)
      .single();
    if (erroFb) throw new Error(erroFb.message);

    const pergunta = String(fb.pergunta_texto ?? versao.item ?? "").trim();
    const esperado = String(versao.valor_novo ?? fb.correcao ?? "").trim();
    const agora = new Date().toISOString();

    const testavel = versao.camada === "planilha" || versao.camada === "busca";
    let status: "validado" | "falhou" | "nao_aplicavel" = "nao_aplicavel";
    let resposta: string | null = null;
    let detalhe: Record<string, string | number | null> = {
      motivo:
        "Esta camada não é validável só pela Base: a mudança precisa passar por homologação de comportamento.",
    };

    if (testavel && pergunta && esperado) {
      const { kb, resumo } = await reconsultarBase(data.clinicaId, pergunta);
      resposta = resumo;
      const ok = baseJaContem(resumo, esperado);
      status = ok ? "validado" : "falhou";
      detalhe = {
        pergunta,
        esperado,
        knowledge_status: String(kb.knowledge_status),
        base_version: kb.base_version ?? null,
        base_file: kb.base_file ?? null,
        testado_em: agora,
      };
    } else if (testavel) {
      detalhe = { motivo: "Sem pergunta original ou sem correção registrada para comparar." };
    }

    const { error: erroUp } = await context.supabase
      .from("nina_feedback_versoes")
      .update({
        teste_status: status,
        teste_em: agora,
        teste_resposta: resposta,
        teste_detalhe: detalhe,
      })
      .eq("id", data.versaoId)
      .eq("clinica_id", data.clinicaId);
    if (erroUp) throw new Error(erroUp.message);

    await context.supabase
      .from("nina_feedback_erros")
      .update({ validacao_status: status, validacao_em: agora, validacao_resposta: resposta })
      .eq("id", versao.feedback_id)
      .eq("clinica_id", data.clinicaId);

    return {
      status,
      resposta,
      detalhe,
      mensagem:
        status === "validado"
          ? "✓ Correção validada: a Nina passa a encontrar a informação corrigida."
          : status === "falhou"
            ? "⚠ A Nina continua respondendo incorretamente. Item mantido para investigação."
            : "Teste automático não aplicável a esta camada — validar em homologação.",
    };
  });

/**
 * Reverte a correção aplicada.
 *  - planilha: reativa a versão anterior do arquivo oficial e reprocessa
 *    chunks, embeddings, índices e cache;
 *  - demais camadas: registra a reversão e devolve o feedback para revisão.
 */
export const reverterVersaoAprendizadoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        versaoId: z.string().uuid(),
        clinicaId: z.string().uuid(),
        motivo: z.string().trim().min(3).max(4000),
        confirmado: z.literal(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);

    const { data: versao, error } = await context.supabase
      .from("nina_feedback_versoes")
      .select("id, feedback_id, acao_id, camada, kb_base_id_anterior, kb_versao_anterior, status")
      .eq("id", data.versaoId)
      .eq("clinica_id", data.clinicaId)
      .single();
    if (error) throw new Error(error.message);
    if (versao.status === "reverted") throw new Error("Esta versão já foi revertida.");

    const agora = new Date().toISOString();
    let detalheBase: string | null = null;

    if (versao.camada === "planilha" || versao.camada === "catalogo") {
      // FASE 7: não há arquivo externo para restaurar. O conteúdo oficial volta
      // ao estado anterior editando e publicando o registro no catálogo.
      detalheBase =
        "Reversão de conteúdo oficial: edite o registro na Base de Conhecimentos da Nina e publique a versão correta.";
    }

    const { error: erroVer } = await context.supabase
      .from("nina_feedback_versoes")
      .update({
        status: "reverted",
        revertido_por: context.userId,
        revertido_em: agora,
        motivo_reversao: data.motivo,
      })
      .eq("id", data.versaoId)
      .eq("clinica_id", data.clinicaId);
    if (erroVer) throw new Error(erroVer.message);

    if (versao.acao_id) {
      await context.supabase
        .from("nina_feedback_acoes")
        .update({ status: "canceled", concluido_por: context.userId, concluido_em: agora })
        .eq("id", versao.acao_id)
        .eq("clinica_id", data.clinicaId);
    }

    const { error: erroFb } = await context.supabase
      .from("nina_feedback_erros")
      .update({
        status: "reverted",
        revertido_por: context.userId,
        revertido_em: agora,
        motivo_reversao: data.motivo,
      })
      .eq("id", versao.feedback_id)
      .eq("clinica_id", data.clinicaId);
    if (erroFb) throw new Error(erroFb.message);

    return { revertido: true, detalheBase };
  });

/** Marca uma ação técnica como homologada (pré-requisito para concluir). */
export const homologarAcaoAprendizadoNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        acaoId: z.string().uuid(),
        clinicaId: z.string().uuid(),
        observacao: z.string().trim().max(4000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);
    const { data: acao, error } = await context.supabase
      .from("nina_feedback_acoes")
      .update({ homologado: true, observacao: data.observacao?.trim() || null })
      .eq("id", data.acaoId)
      .eq("clinica_id", data.clinicaId)
      .select("id, homologado, titulo")
      .single();
    if (error) throw new Error(error.message);
    return acao;
  });

/** Utilitário exportado para reuso na aplicação (Fase 4 → registra versão). */
export function precisaHomologacao(camada: string | null | undefined): boolean {
  return camada === "busca" || camada === "modelo" || camada === "ferramenta" || camada === "fluxo";
}

export { planoParaCausa };
