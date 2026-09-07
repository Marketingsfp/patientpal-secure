/**
 * Leitura das decisões do Confidence Decision Engine para o painel da Nina.
 * Escopo por clínica: RLS já restringe, e a função só lê.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ResumoConfianca = {
  total: number;
  responder: number;
  esclarecer: number;
  transferir: number;
  scoreMedio: number;
  porBloqueio: Array<{ bloqueio: string; total: number }>;
  porCategoria: Array<{ categoria: string; total: number }>;
  ultimas: Array<{
    id: string;
    created_at: string;
    ambiente: string;
    acao: string;
    score: number;
    bloqueio: string | null;
    motivos: string[];
    conversation_id: string | null;
  }>;
};

export const resumoConfiancaNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        dias: z.number().int().min(1).max(90).default(7),
        ambiente: z.enum(["todos", "producao", "homologacao"]).default("todos"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ResumoConfianca> => {
    const desde = new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000).toISOString();
    let q = context.supabase
      .from("nina_confianca_decisoes")
      .select("id, created_at, ambiente, acao, score, bloqueio, motivos, categorias, conversation_id")
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.ambiente !== "todos") q = q.eq("ambiente", data.ambiente);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const linhas = (rows ?? []) as Array<{
      id: string;
      created_at: string;
      ambiente: string;
      acao: string;
      score: number | string;
      bloqueio: string | null;
      motivos: unknown;
      categorias: unknown;
      conversation_id: string | null;
    }>;

    const bloqueios = new Map<string, number>();
    const categorias = new Map<string, number>();
    let soma = 0;
    for (const l of linhas) {
      soma += Number(l.score) || 0;
      if (l.bloqueio) bloqueios.set(l.bloqueio, (bloqueios.get(l.bloqueio) ?? 0) + 1);
      for (const c of Array.isArray(l.categorias) ? (l.categorias as string[]) : [])
        categorias.set(c, (categorias.get(c) ?? 0) + 1);
    }
    const conta = (a: string) => linhas.filter((l) => l.acao === a).length;

    return {
      total: linhas.length,
      responder: conta("responder"),
      esclarecer: conta("esclarecer"),
      transferir: conta("transferir"),
      scoreMedio: linhas.length ? Math.round((soma / linhas.length) * 10) / 10 : 0,
      porBloqueio: [...bloqueios.entries()]
        .map(([bloqueio, total]) => ({ bloqueio, total }))
        .sort((a, b) => b.total - a.total),
      porCategoria: [...categorias.entries()]
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => b.total - a.total),
      ultimas: linhas.slice(0, 20).map((l) => ({
        id: l.id,
        created_at: l.created_at,
        ambiente: l.ambiente,
        acao: l.acao,
        score: Number(l.score) || 0,
        bloqueio: l.bloqueio,
        motivos: Array.isArray(l.motivos) ? (l.motivos as string[]) : [],
        conversation_id: l.conversation_id,
      })),
    };
  });

// ------------------------------------------------ FASE 5: explicabilidade

import {
  ROTULO_NIVEL,
  ROTULO_RESULTADO,
  linhasConfiabilidade,
  type LinhaConfiabilidade,
  type ResultadoFinalAuditoria,
} from "./confidence/auditoria";
import type { NivelConfianca } from "./confidence/types";

export type ConfiabilidadeDecisaoView = {
  score: number;
  nivel: string;
  resultado: string;
  intencao: string | null;
  ambiente: string;
  bloqueadores: string[];
  linhas: LinhaConfiabilidade[];
  registradoEm: string;
};

/**
 * Confiabilidade registrada para a resposta (execução) auditada.
 * Só evidência observável — nunca rascunho ou raciocínio do modelo.
 */
export const confiabilidadeDaExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), execucaoId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ConfiabilidadeDecisaoView | null> => {
    const { data: row, error } = await context.supabase
      .from("nina_confianca_decisoes")
      .select(
        "created_at, ambiente, score, nivel, intencao, resultado_final, bloqueadores, validadores, ferramentas, fontes",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("execucao_id", data.execucaoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const r = row as unknown as {
      created_at: string;
      ambiente: string;
      score: number | string;
      nivel: string | null;
      intencao: string | null;
      resultado_final: string | null;
      bloqueadores: string[] | null;
      validadores: unknown;
      ferramentas: unknown;
      fontes: unknown;
    };

    const registro = {
      validadores: Array.isArray(r.validadores)
        ? (r.validadores as Parameters<typeof linhasConfiabilidade>[0]["validadores"])
        : [],
      ferramentas: Array.isArray(r.ferramentas)
        ? (r.ferramentas as Parameters<typeof linhasConfiabilidade>[0]["ferramentas"])
        : [],
      fontes: Array.isArray(r.fontes)
        ? (r.fontes as Parameters<typeof linhasConfiabilidade>[0]["fontes"])
        : [],
    };

    return {
      score: Math.round(Number(r.score) || 0),
      nivel: ROTULO_NIVEL[(r.nivel ?? "LOW") as NivelConfianca] ?? "—",
      resultado:
        ROTULO_RESULTADO[(r.resultado_final ?? "transferido_para_humano") as ResultadoFinalAuditoria] ??
        "—",
      intencao: r.intencao,
      ambiente: r.ambiente,
      bloqueadores: r.bloqueadores ?? [],
      linhas: linhasConfiabilidade(registro),
      registradoEm: r.created_at,
    };
  });

// ------------------------------------------------ FASE 6: métricas de confiabilidade

import {
  calcularMetricasConfiabilidade,
  type ErroReportado,
  type LinhaDecisaoMetrica,
  type MetricasConfiabilidade,
  type PeriodoOperacao,
} from "./confidence/metricas";

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.map((i) => String(i)).filter(Boolean) : [];
}

export const metricasConfiabilidadeNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        dias: z.number().int().min(1).max(180).default(30),
        ambiente: z.enum(["todos", "producao", "homologacao"]).default("producao"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<MetricasConfiabilidade> => {
    const desde = new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000).toISOString();

    let q = context.supabase
      .from("nina_confianca_decisoes")
      .select(
        "id, created_at, ambiente, conversation_id, score, nivel, decisao, acao, intencao, categorias, bloqueadores, bloqueio, reason_codes, validadores, ferramentas",
      )
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.ambiente !== "todos") q = q.eq("ambiente", data.ambiente);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { data: errosRows } = await context.supabase
      .from("nina_feedback_erros")
      .select("id, conversa_id, created_at, categoria")
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      .limit(5000);

    // Dentro/fora do horário: reutiliza o classificador central já publicado.
    let calendarios: Awaited<
      ReturnType<typeof import("./classificador-periodo.functions").carregarCalendariosPublicados>
    > = [];
    let classificar: typeof import("./classificador-periodo").classificarPeriodo | null = null;
    try {
      const [{ carregarCalendariosPublicadosCache }, mod] = await Promise.all([
        import("./classificador-periodo.functions"),
        import("./classificador-periodo"),
      ]);
      calendarios = await carregarCalendariosPublicadosCache(context.supabase, data.clinicaId);
      classificar = mod.classificarPeriodo;
    } catch {
      calendarios = [];
      classificar = null;
    }

    const linhas: LinhaDecisaoMetrica[] = (rows ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const created = String(r["created_at"] ?? "");
      let periodo: PeriodoOperacao = "NAO_CLASSIFICAVEL";
      let dataLocal: string | null = null;
      if (classificar) {
        const c = classificar({
          em: created,
          escopo: { clinica_id: data.clinicaId, unidade_id: null },
          calendarios,
        });
        periodo = c.classificacao as PeriodoOperacao;
        dataLocal = c.data_local ?? null;
      }
      if (!dataLocal && created) dataLocal = created.slice(0, 10);
      const dow = dataLocal ? new Date(`${dataLocal}T12:00:00Z`).getUTCDay() : null;

      const bloqueio = r["bloqueio"] ? [String(r["bloqueio"])] : [];
      const bloqueadores = [...new Set([...lista(r["bloqueadores"]), ...bloqueio])];

      return {
        id: String(r["id"] ?? ""),
        created_at: created,
        ambiente: (r["ambiente"] as string) ?? null,
        conversation_id: (r["conversation_id"] as string) ?? null,
        score: Number(r["score"]) || 0,
        nivel: (r["nivel"] as string) ?? null,
        decisao: (r["decisao"] as string) ?? null,
        acao: (r["acao"] as string) ?? null,
        intencao: (r["intencao"] as string) ?? null,
        categorias: lista(r["categorias"]),
        bloqueadores,
        reason_codes: lista(r["reason_codes"]),
        validadores: Array.isArray(r["validadores"])
          ? (r["validadores"] as Array<Record<string, unknown>>).map((v) => ({
              validator: String(v["validator"] ?? ""),
              status: String(v["status"] ?? ""),
              reasonCode: v["reasonCode"] ? String(v["reasonCode"]) : null,
            }))
          : [],
        ferramentas: Array.isArray(r["ferramentas"])
          ? (r["ferramentas"] as Array<Record<string, unknown>>).map((f) => ({
              nome: String(f["nome"] ?? ""),
              sucesso: f["sucesso"] !== false,
            }))
          : [],
        data_local: dataLocal,
        dia_semana: dow,
        periodo,
      };
    });

    const erros: ErroReportado[] = (errosRows ?? []).map((raw) => {
      const e = raw as Record<string, unknown>;
      return {
        id: String(e["id"] ?? ""),
        conversa_id: (e["conversa_id"] as string) ?? null,
        created_at: String(e["created_at"] ?? ""),
        categoria: (e["categoria"] as string) ?? null,
      };
    });

    return calcularMetricasConfiabilidade(linhas, erros);
  });

// ------------------------------------------------ FASE 9: autoavaliação

import type { Json } from "@/integrations/supabase/types";
import {
  calibrar,
  type ErroCalibracao,
  type LinhaCalibracao,
  type RelatorioCalibracao,
  type ResultadoConversa,
} from "./confidence/calibracao";

/**
 * Cruza confiança × erro reportado × handoff × agendamento × resultado da
 * conversa e devolve o relatório com PROPOSTAS de ajuste (nunca aplicadas).
 */
export const calibracaoConfiancaNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        dias: z.number().int().min(7).max(180).default(30),
        ambiente: z.enum(["todos", "producao", "homologacao"]).default("producao"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<RelatorioCalibracao> => {
    const desde = new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000).toISOString();

    let q = context.supabase
      .from("nina_confianca_decisoes")
      .select(
        "id, created_at, ambiente, conversation_id, message_id, execucao_id, score, nivel, decisao, acao, resultado_final, acao_solicitada, bloqueadores, bloqueio, reason_codes, categorias, validadores",
      )
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.ambiente !== "todos") q = q.eq("ambiente", data.ambiente);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const decisoes: LinhaCalibracao[] = (rows ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      const bloqueio = r["bloqueio"] ? [String(r["bloqueio"])] : [];
      return {
        id: String(r["id"] ?? ""),
        created_at: String(r["created_at"] ?? ""),
        ambiente: (r["ambiente"] as string) ?? null,
        conversation_id: (r["conversation_id"] as string) ?? null,
        message_id: (r["message_id"] as string) ?? null,
        execucao_id: (r["execucao_id"] as string) ?? null,
        score: Number(r["score"]) || 0,
        nivel: (r["nivel"] as string) ?? null,
        decisao: ((r["decisao"] as string) ?? (r["acao"] as string)) ?? null,
        resultado_final: (r["resultado_final"] as string) ?? null,
        acao_solicitada: (r["acao_solicitada"] as string) ?? null,
        bloqueadores: [...new Set([...lista(r["bloqueadores"]), ...bloqueio])],
        reason_codes: lista(r["reason_codes"]),
        categorias: lista(r["categorias"]),
        validadores: Array.isArray(r["validadores"])
          ? (r["validadores"] as Array<Record<string, unknown>>).map((v) => ({
              validator: String(v["validator"] ?? ""),
              status: String(v["status"] ?? ""),
              reasonCode: v["reasonCode"] ? String(v["reasonCode"]) : null,
            }))
          : [],
      };
    });

    const { data: errosRows } = await context.supabase
      .from("nina_feedback_erros")
      .select("id, conversa_id, mensagem_id, execucao_id, categoria, created_at")
      .eq("clinica_id", data.clinicaId)
      .gte("created_at", desde)
      .limit(5000);

    const erros: ErroCalibracao[] = (errosRows ?? []).map((raw) => {
      const e = raw as Record<string, unknown>;
      return {
        id: String(e["id"] ?? ""),
        conversa_id: (e["conversa_id"] as string) ?? null,
        mensagem_id: (e["mensagem_id"] as string) ?? null,
        execucao_id: (e["execucao_id"] as string) ?? null,
        categoria: (e["categoria"] as string) ?? null,
        created_at: String(e["created_at"] ?? ""),
      };
    });

    // Resultado observado da conversa (status e transferência) — só das
    // conversas que aparecem nas decisões do período.
    const ids = [...new Set(decisoes.map((d) => d.conversation_id).filter(Boolean))] as string[];
    let conversas: ResultadoConversa[] = [];
    if (ids.length > 0) {
      const { data: convRows } = await context.supabase
        .from("atend_conversas")
        .select("id, status, handoff_em")
        .in("id", ids.slice(0, 1000));
      // "Agendamento correto" = o motor só libera a confirmação depois do
      // retorno real do backend; então a decisão liberada de uma ação de
      // agendamento é a evidência de que ela aconteceu de verdade.
      const tentouAgendar = new Map<string, boolean>();
      for (const d of decisoes) {
        if (!d.conversation_id) continue;
        if (!(d.acao_solicitada ?? "").includes("agendamento")) continue;
        const ok = d.resultado_final === "resposta_liberada" || d.decisao === "ALLOW";
        tentouAgendar.set(d.conversation_id, (tentouAgendar.get(d.conversation_id) ?? false) || ok);
      }
      conversas = (convRows ?? []).map((raw) => {
        const c = raw as { id: string; status: string | null; handoff_em: string | null };
        return {
          conversa_id: c.id,
          status: c.status,
          houveHandoff: Boolean(c.handoff_em),
          agendamentoConfirmado: tentouAgendar.has(c.id) ? tentouAgendar.get(c.id)! : null,
        };
      });
    }


    return calibrar(decisoes, erros, conversas);
  });

export type PropostaConfiancaView = {
  id: string;
  tipo: string;
  alvo: string;
  valor_atual: string | null;
  valor_sugerido: string | null;
  justificativa: string;
  evidencia: { amostra?: number; comErro?: number; taxaErro?: number };
  status: string;
  created_at: string;
  decidido_em: string | null;
  motivo_decisao: string | null;
  aplicado_em: string | null;
};

export const listarPropostasConfianca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<PropostaConfiancaView[]> => {
    const { data: rows, error } = await context.supabase
      .from("nina_confianca_propostas")
      .select(
        "id, tipo, alvo, valor_atual, valor_sugerido, justificativa, evidencia, status, created_at, decidido_em, motivo_decisao, aplicado_em",
      )
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        ...(row as unknown as Omit<PropostaConfiancaView, "evidencia">),
        evidencia: (row["evidencia"] ?? {}) as PropostaConfiancaView["evidencia"],
      };
    });
  });

/** Registra as sugestões do relatório como PENDENTES de revisão humana. */
export const registrarPropostasConfianca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        propostas: z
          .array(
            z.object({
              tipo: z.enum([
                "AJUSTAR_PESO",
                "AJUSTAR_LIMITE",
                "REVISAR_VALIDADOR",
                "NOVO_BLOQUEADOR",
              ]),
              alvo: z.string().min(1),
              valorAtual: z.union([z.string(), z.number(), z.null()]),
              valorSugerido: z.union([z.string(), z.number(), z.null()]),
              justificativa: z.string().min(1),
              evidencia: z.record(z.string(), z.unknown()).default({}),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ inseridas: number }> => {
    const linhas = data.propostas.map((p) => ({
      clinica_id: data.clinicaId,
      tipo: p.tipo,
      alvo: p.alvo,
      valor_atual: p.valorAtual == null ? null : String(p.valorAtual),
      valor_sugerido: p.valorSugerido == null ? null : String(p.valorSugerido),
      justificativa: p.justificativa,
      evidencia: p.evidencia as unknown as Json,
      origem: "calibracao_automatica",
      status: "pendente",
    }));
    const { error, count } = await context.supabase
      .from("nina_confianca_propostas")
      .insert(linhas, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inseridas: count ?? linhas.length };
  });

/**
 * Aprovar, rejeitar ou aplicar uma proposta. Sempre com pessoa responsável:
 * a Nina não pode chamar esta função (exige sessão autenticada).
 */
export const decidirPropostaConfianca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        propostaId: z.string().uuid(),
        decisao: z.enum(["aprovada", "rejeitada", "aplicada"]),
        motivo: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const agora = new Date().toISOString();
    const patch: Partial<{
      status: string;
      decidido_por: string;
      decidido_em: string;
      motivo_decisao: string | null;
      aplicado_por: string;
      aplicado_em: string;
    }> =
      data.decisao === "aplicada"
        ? { status: "aplicada", aplicado_por: context.userId, aplicado_em: agora }
        : {
            status: data.decisao,
            decidido_por: context.userId,
            decidido_em: agora,
            motivo_decisao: data.motivo ?? null,
          };

    const { error } = await context.supabase
      .from("nina_confianca_propostas")
      .update(patch)
      .eq("id", data.propostaId)
      .eq("clinica_id", data.clinicaId);
    if (error) throw new Error(error.message);

    if (data.decisao === "aplicada") {
      const { limparCachePolitica } = await import("./confidence/politica-override.server");
      limparCachePolitica(data.clinicaId);
    }
    return { status: data.decisao };
  });

// --------------------------- Indicador de confiança na Inbox (por mensagem)

export type ConfiancaDaMensagem = {
  execucao_id: string;
  score: number;
  nivel: "HIGH" | "MEDIUM" | "LOW";
  resultado: string;
  bloqueadores: string[];
  registrado_em: string;
};

/**
 * Confiança REAL registrada pelo motor no instante em que cada resposta foi
 * produzida. Nada é recalculado aqui nem no navegador: é leitura direta do
 * que ficou gravado, casado pela execução que gerou a mensagem.
 */
export const confiancaDasExecucoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        execucaoIds: z.array(z.string().uuid()).min(1).max(300),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ConfiancaDaMensagem[]> => {
    const { data: rows, error } = await context.supabase
      .from("nina_confianca_decisoes")
      .select("execucao_id, score, nivel, resultado_final, acao, bloqueadores, bloqueio, created_at")
      .eq("clinica_id", data.clinicaId)
      .in("execucao_id", data.execucaoIds)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Uma execução pode ter mais de uma decisão (esclarecimento + resposta):
    // vale a última, que é a que produziu a mensagem entregue.
    const porExecucao = new Map<string, ConfiancaDaMensagem>();
    for (const raw of rows ?? []) {
      const r = raw as Record<string, unknown>;
      const id = r["execucao_id"] ? String(r["execucao_id"]) : "";
      if (!id) continue;
      const bloqueio = r["bloqueio"] ? [String(r["bloqueio"])] : [];
      porExecucao.set(id, {
        execucao_id: id,
        score: Math.round(Number(r["score"]) || 0),
        nivel: ((r["nivel"] as string) ?? "LOW") as "HIGH" | "MEDIUM" | "LOW",
        resultado: (r["resultado_final"] as string) ?? (r["acao"] as string) ?? "",
        bloqueadores: [...new Set([...lista(r["bloqueadores"]), ...bloqueio])],
        registrado_em: String(r["created_at"] ?? ""),
      });
    }
    return [...porExecucao.values()];
  });
