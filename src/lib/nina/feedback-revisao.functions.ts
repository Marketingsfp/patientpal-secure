/**
 * Central de revisão dos erros da Nina — FASE 2.
 *
 * IMPORTANTE: aprovar ou rejeitar aqui NÃO altera planilha, Base de
 * Conhecimentos, embeddings, prompt, modelo, regras ou ferramentas. Nesta fase
 * a revisão apenas muda a situação do registro (validado / recusado). A
 * aplicação real virá em fase posterior.
 *
 * Permissões: qualquer membro da clínica registra e consulta (Fase 1);
 * somente admin, gestor ou supervisor da clínica revisa (aprovar, rejeitar,
 * colocar em revisão ou editar a sugestão).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUS = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "applied",
  "reverted",
] as const;
export type StatusFeedbackNina = (typeof STATUS)[number];

const COLUNAS =
  "id, clinica_id, conversa_id, mensagem_id, mensagem_texto, pergunta_texto, categoria, origem, correcao, correcao_original, observacao, motivo_rejeicao, status, reportado_por, revisado_por, revisado_em, unidade_id, created_at, updated_at, root_cause, prioridade, knowledge_status, knowledge_snapshot, knowledge_consultado_em, grupo_chave, grupo_titulo, diagnosticado_por, diagnosticado_em, execucao_id, auditoria_status";

type ClienteSupabase = {
  rpc: (
    fn: "nina_fb_pode_revisar",
    args: { _user_id: string; _clinica_id: string },
  ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
};

async function assertRevisor(supabase: unknown, userId: string, clinicaId: string) {
  const { data, error } = await (supabase as ClienteSupabase).rpc("nina_fb_pode_revisar", {
    _user_id: userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Somente supervisão, gestão ou administração pode revisar.");
}

/** Indica se o usuário atual pode aprovar/rejeitar nesta clínica. */
export const podeRevisarFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("nina_fb_pode_revisar", {
      _user_id: context.userId,
      _clinica_id: data.clinicaId,
    });
    if (error) throw new Error(error.message);
    return { podeRevisar: Boolean(ok) };
  });

const filtros = z.object({
  clinicaId: z.string().uuid(),
  status: z.enum(STATUS).nullish(),
  categoria: z.string().max(60).nullish(),
  reportadoPor: z.string().uuid().nullish(),
  unidadeId: z.string().uuid().nullish(),
  de: z.string().nullish(),
  ate: z.string().nullish(),
  limite: z.number().int().min(1).max(500).default(200),
});

export const listarRevisaoFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => filtros.parse(i))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nina_feedback_erros")
      .select(COLUNAS)
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(data.limite);

    if (data.status) q = q.eq("status", data.status);
    if (data.categoria) q = q.eq("categoria", data.categoria);
    if (data.reportadoPor) q = q.eq("reportado_por", data.reportadoPor);
    if (data.unidadeId) q = q.eq("unidade_id", data.unidadeId);
    if (data.de) q = q.gte("created_at", `${data.de}T00:00:00`);
    if (data.ate) q = q.lte("created_at", `${data.ate}T23:59:59`);

    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    const itens = linhas ?? [];

    // Nomes de quem reportou/revisou, para a tela.
    const ids = Array.from(
      new Set(
        itens.flatMap((l) => [l.reportado_por, l.revisado_por]).filter(Boolean) as string[],
      ),
    );
    let pessoas: Record<string, string> = {};
    if (ids.length) {
      const { data: perfis } = await context.supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      pessoas = Object.fromEntries((perfis ?? []).map((p) => [p.id, p.nome ?? "—"]));
    }

    // Código amigável (#numero) das conversas citadas, para exibir junto ao ID.
    const conversas: Record<string, number> = {};
    const idsConversa = Array.from(
      new Set(itens.map((l) => l.conversa_id).filter(Boolean) as string[]),
    );
    if (idsConversa.length) {
      const { data: convs } = await context.supabase
        .from("atend_conversas")
        .select("id, numero_conversa")
        .in("id", idsConversa);
      for (const c of convs ?? []) {
        if (c.numero_conversa != null) conversas[c.id] = Number(c.numero_conversa);
      }
    }


    // Contagem por situação (para as abas), respeitando os demais filtros.
    const contagens: Record<string, number> = {};
    for (const s of STATUS) contagens[s] = 0;
    let qc = context.supabase
      .from("nina_feedback_erros")
      .select("status")
      .eq("clinica_id", data.clinicaId)
      .limit(2000);
    if (data.categoria) qc = qc.eq("categoria", data.categoria);
    if (data.reportadoPor) qc = qc.eq("reportado_por", data.reportadoPor);
    if (data.unidadeId) qc = qc.eq("unidade_id", data.unidadeId);
    if (data.de) qc = qc.gte("created_at", `${data.de}T00:00:00`);
    if (data.ate) qc = qc.lte("created_at", `${data.ate}T23:59:59`);
    const { data: todos } = await qc;
    for (const l of todos ?? []) contagens[l.status] = (contagens[l.status] ?? 0) + 1;

    // Agrupamento: quantas ocorrências existem por problema (registros
    // individuais continuam intactos, só ficam vinculados pela chave).
    const ocorrencias: Record<string, number> = {};
    const { data: grupos } = await context.supabase
      .from("nina_feedback_erros")
      .select("grupo_chave")
      .eq("clinica_id", data.clinicaId)
      .not("grupo_chave", "is", null)
      .limit(5000);
    for (const g of grupos ?? []) {
      const k = g.grupo_chave as string | null;
      if (k) ocorrencias[k] = (ocorrencias[k] ?? 0) + 1;
    }

    // Auditoria técnica: só o PONTEIRO para o registro existente (nada é
    // copiado para outro armazenamento). O estado é recalculado na leitura,
    // então "Em processamento" vira "Disponível" assim que o registro chega,
    // e vira "Indisponível" quando a retenção já expurgou a evidência.
    const { estadoAuditoria } = await import("@/lib/nina/erro-rapido");
    const execucoes: Record<
      string,
      { id: string; model: string | null; latency_ms: number | null; created_at: string | null; success: boolean | null; knowledge_status: string | null; thinking_level: string | null; route_reason: string | null; tool_calls: string[] | null }
    > = {};
    const idsExec = Array.from(
      new Set(itens.map((l) => (l as { execucao_id?: string | null }).execucao_id).filter(Boolean) as string[]),
    );
    if (idsExec.length) {
      const { data: execs } = await context.supabase
        .from("nina_execucoes")
        .select(
          "id, model, latency_ms, created_at, success, knowledge_status, thinking_level, route_reason, tool_calls",
        )
        .in("id", idsExec);
      for (const e of execs ?? []) execucoes[e.id] = e as (typeof execucoes)[string];
    }
    const auditoria: Record<string, string> = {};
    for (const l of itens) {
      const execId = (l as { execucao_id?: string | null }).execucao_id ?? null;
      auditoria[l.id] = estadoAuditoria({
        execucaoId: execId,
        execucao: execId ? (execucoes[execId] ?? null) : null,
        mensagemCriadaEmMs: l.created_at ? Date.parse(l.created_at) : null,
      });
    }

    return { itens, pessoas, contagens, ocorrencias, conversas, execucoes, auditoria };
  });

/** Lista quem já reportou erros na clínica — alimenta o filtro por atendente. */
export const listarAutoresFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: linhas, error } = await context.supabase
      .from("nina_feedback_erros")
      .select("reportado_por")
      .eq("clinica_id", data.clinicaId)
      .limit(2000);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((linhas ?? []).map((l) => l.reportado_por).filter(Boolean)));
    if (!ids.length) return [] as { id: string; nome: string }[];
    const { data: perfis } = await context.supabase
      .from("profiles")
      .select("id, nome")
      .in("id", ids as string[]);
    return (perfis ?? []).map((p) => ({ id: p.id, nome: p.nome ?? "—" }));
  });

const acaoSchema = z.object({
  id: z.string().uuid(),
  clinicaId: z.string().uuid(),
  acao: z.enum(["under_review", "approved", "rejected", "pending"]),
  motivo: z.string().trim().max(2000).nullish(),
  correcao: z.string().trim().min(3).max(4000).nullish(),
});

/**
 * Revisa um feedback. Só muda a situação do registro — nada é aplicado na
 * Base de Conhecimentos nesta fase.
 */
export const revisarFeedbackErroNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => acaoSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);

    const patch: {
      status: string;
      revisado_por: string;
      revisado_em: string;
      motivo_rejeicao?: string | null;
      correcao?: string;
    } = {
      status: data.acao,
      revisado_por: context.userId,
      revisado_em: new Date().toISOString(),
    };
    if (data.acao === "rejected") {
      patch.motivo_rejeicao = data.motivo?.trim() ? data.motivo.trim() : null;
    }
    if (data.correcao) patch.correcao = data.correcao;

    const { data: linha, error } = await context.supabase
      .from("nina_feedback_erros")
      .update(patch)
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .select(COLUNAS)
      .single();
    if (error) throw new Error(error.message);
    return linha;
  });

/** Edita apenas a correção sugerida, mantendo a situação atual. */
export const editarSugestaoFeedbackNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        clinicaId: z.string().uuid(),
        correcao: z.string().trim().min(3).max(4000),
        observacao: z.string().trim().max(4000).nullish(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRevisor(context.supabase, context.userId, data.clinicaId);
    const { data: linha, error } = await context.supabase
      .from("nina_feedback_erros")
      .update({
        correcao: data.correcao,
        observacao: data.observacao?.trim() ? data.observacao.trim() : null,
      })
      .eq("id", data.id)
      .eq("clinica_id", data.clinicaId)
      .select(COLUNAS)
      .single();
    if (error) throw new Error(error.message);
    return linha;
  });
