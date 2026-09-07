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
