/**
 * FASE 4 — "Analisar com IA" de um erro reportado da Nina.
 *
 * Execução SEPARADA da Nina que atende pacientes: modelo próprio
 * (`openai/gpt-5.6-sol`), sem ferramentas, sem escrita, sem navegação.
 * Só roda por clique explícito e grava uma versão por análise.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { carregarEvidenciasExecucao } from "./evidencias.functions";
import {
  INSTRUCOES_AVALIADOR,
  LIMITE_ANALISES_POR_ERRO,
  MODELO_ANALISE,
  SCHEMA_ANALISE,
  VERSAO_CRITERIOS_ANALISE,
  montarPacote,
  montarPromptAnalise,
  normalizarResultado,
  type PacoteEvidencias,
  type ResultadoAnalise,
  type Verificacao,
} from "./analise-erro";

type ResumoEvidencias = {
  entradas: number;
  etapas: number;
  lacunas: string[];
  verificacoes: Verificacao[];
  modelo_da_execucao: string | null;
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

type Analise = {
  id: string;
  feedback_id: string;
  versao: number;
  modelo: string;
  status: "processing" | "done" | "failed";
  criterios_versao: string;
  conclusao: string | null;
  resultado: ResultadoAnalise | null;
  evidencias_resumo: ResumoEvidencias | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duracao_ms: number | null;
  erro: string | null;
  solicitado_por: string;
  created_at: string;
  concluida_em: string | null;
};

const COLUNAS =
  "id, feedback_id, versao, modelo, status, criterios_versao, conclusao, resultado, evidencias_resumo, input_tokens, output_tokens, duracao_ms, erro, solicitado_por, created_at, concluida_em";

async function exigirPermissao(context: any, clinicaId: string) {
  const { data: pode, error } = await (context.supabase as any).rpc("nina_fb_pode_revisar", {
    _user_id: context.userId,
    _clinica_id: clinicaId,
  });
  if (error) throw new Error(error.message);
  if (!pode) throw new Error("Sem permissão para analisar erros desta clínica.");
}

/** Chama o avaliador via Responses API (streaming consumido no servidor). */
async function chamarAvaliador(
  prompt: string,
): Promise<{ texto: string; inputTokens: number | null; outputTokens: number | null }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Análise indisponível: chave do provedor de IA não configurada.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODELO_ANALISE,
      instructions: INSTRUCOES_AVALIADOR,
      input: prompt,
      stream: true,
      store: false,
      // Sem ferramentas: o avaliador não escreve, não navega e não executa código.
      tools: [],
      // Não pedimos resumo de raciocínio: nada de pensamento privado é solicitado ou guardado.
      text: {
        format: {
          type: "json_schema",
          name: "analise_erro_nina",
          strict: true,
          schema: SCHEMA_ANALISE,
        },
      },
    }),
  });

  if (!res.ok || !res.body) {
    const corpo = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("Créditos de IA esgotados para esta análise.");
    if (res.status === 429) throw new Error("Limite de uso do modelo atingido. Tente mais tarde.");
    if (res.status === 400 && /model/i.test(corpo)) {
      throw new Error(`Modelo ${MODELO_ANALISE} indisponível no provedor deste projeto.`);
    }
    throw new Error(`Falha do provedor (${res.status}). Análise não concluída.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let texto = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.startsWith("data:")) continue;
      const bruto = linha.slice(5).trim();
      if (!bruto || bruto === "[DONE]") continue;
      let ev: any;
      try {
        ev = JSON.parse(bruto);
      } catch {
        continue;
      }
      if (ev?.type === "response.output_text.delta" && typeof ev.delta === "string") {
        texto += ev.delta;
      }
      if (ev?.type === "response.completed" && ev.response) {
        if (typeof ev.response.output_text === "string" && ev.response.output_text) {
          texto = ev.response.output_text;
        }
        inputTokens = ev.response.usage?.input_tokens ?? null;
        outputTokens = ev.response.usage?.output_tokens ?? null;
      }
      if (ev?.type === "error" || ev?.type === "response.failed") {
        throw new Error(ev?.error?.message ?? "Falha do provedor durante a análise.");
      }
    }
  }

  return { texto, inputTokens, outputTokens };
}

function resumoEvidencias(p: PacoteEvidencias): ResumoEvidencias {
  return {
    entradas: p.entradas.length,
    etapas: p.etapas.length,
    lacunas: p.lacunas,
    verificacoes: p.verificacoes,
    modelo_da_execucao: p.execucao?.modelo ?? null,
  };
}

/** Lista as análises já registradas de um erro (não chama o modelo). */
export const listarAnalisesErroNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clinicaId: z.string().uuid(), feedbackId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirPermissao(context, data.clinicaId);
    const { analiseIAAtivaNaClinica } = await import("./analise-flag.server");
    const ativa = await analiseIAAtivaNaClinica(data.clinicaId);
    const { data: linhas, error } = await (context.supabase as any)
      .from("nina_feedback_analises")
      .select(COLUNAS)
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId)
      .order("versao", { ascending: false });
    if (error) throw new Error(error.message);
    return { analises: (linhas ?? []) as Analise[], ativa };
  });

export const analisarErroNinaComIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        feedbackId: z.string().uuid(),
        reanalisar: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await exigirPermissao(context, data.clinicaId);
    const { analiseIAAtivaNaClinica, MSG_ANALISE_DESATIVADA } = await import(
      "./analise-flag.server"
    );
    if (!(await analiseIAAtivaNaClinica(data.clinicaId))) {
      throw new Error(MSG_ANALISE_DESATIVADA);
    }
    const supabase = context.supabase as any;

    const { data: existentes, error: eLista } = await supabase
      .from("nina_feedback_analises")
      .select(COLUNAS)
      .eq("clinica_id", data.clinicaId)
      .eq("feedback_id", data.feedbackId)
      .order("versao", { ascending: false });
    if (eLista) throw new Error(eLista.message);
    const analises = (existentes ?? []) as Analise[];

    const emCurso = analises.find((a) => a.status === "processing");
    if (emCurso) return { analise: emCurso, jaExistia: true as const };

    const concluida = analises.find((a) => a.status === "done");
    if (concluida && !data.reanalisar) return { analise: concluida, jaExistia: true as const };

    if (analises.length >= LIMITE_ANALISES_POR_ERRO) {
      throw new Error(
        `Limite de ${LIMITE_ANALISES_POR_ERRO} análises por erro atingido. Revise manualmente.`,
      );
    }

    const { data: reporte, error: eRep } = await supabase
      .from("nina_feedback_erros")
      .select("id, clinica_id, conversa_id, mensagem_texto, execucao_id")
      .eq("id", data.feedbackId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (eRep) throw new Error(eRep.message);
    if (!reporte) throw new Error("Erro reportado não encontrado nesta clínica.");

    const versao = (analises[0]?.versao ?? 0) + 1;

    // Trava de duplo clique: índice único parcial em (feedback_id) enquanto 'processing'.
    const { data: criada, error: eIns } = await supabase
      .from("nina_feedback_analises")
      .insert({
        clinica_id: data.clinicaId,
        feedback_id: data.feedbackId,
        execucao_id: reporte.execucao_id ?? null,
        versao,
        criterios_versao: VERSAO_CRITERIOS_ANALISE,
        modelo: MODELO_ANALISE,
        status: "processing",
        solicitado_por: context.userId,
      })
      .select(COLUNAS)
      .single();
    if (eIns) {
      if (String(eIns.code) === "23505") {
        const { data: atual } = await supabase
          .from("nina_feedback_analises")
          .select(COLUNAS)
          .eq("feedback_id", data.feedbackId)
          .order("versao", { ascending: false })
          .limit(1)
          .maybeSingle();
        return { analise: (atual ?? null) as Analise | null, jaExistia: true as const };
      }
      throw new Error(eIns.message);
    }

    const inicio = Date.now();
    try {
      let evid: any = { disponivel: false };
      if (reporte.execucao_id) {
        evid = await carregarEvidenciasExecucao(
          context.supabase,
          data.clinicaId,
          reporte.execucao_id,
        );
      }

      const pacote = montarPacote({
        mensagemReportada: reporte.mensagem_texto ?? "",
        entradas: (evid?.entradas ?? evid?.pergunta?.entradas ?? []).map((e: any) => ({
          em: e.em ?? null,
          texto: e.texto ?? "",
        })),
        execucao: evid?.execucao
          ? {
              modelo: evid.execucao.model ?? null,
              nivel: evid.execucao.thinking_level ?? null,
              latenciaMs: evid.execucao.latency_ms ?? null,
              knowledgeStatus: evid.execucao.knowledge_status ?? null,
              toolCalls: evid.execucao.tool_calls ?? null,
              sucesso: evid.execucao.success ?? null,
              categoriaErro: evid.execucao.error_category ?? null,
              handoff: evid.execucao.handoff ?? null,
              em: evid.execucao.created_at ?? null,
            }
          : null,
        etapas: (evid?.etapas ?? []) as any[],
        lacunas: (evid?.lacunas ?? (reporte.execucao_id ? [] : ["Sem registro técnico vinculado."])) as string[],
      });

      const { texto, inputTokens, outputTokens } = await chamarAvaliador(
        montarPromptAnalise(pacote),
      );
      let bruto: unknown = null;
      try {
        bruto = JSON.parse(texto);
      } catch {
        bruto = null;
      }
      if (!bruto) throw new Error("O avaliador não devolveu um resultado interpretável.");

      const resultado = normalizarResultado(bruto, pacote.verificacoes);

      const { data: fim, error: eUpd } = await supabase
        .from("nina_feedback_analises")
        .update({
          status: "done",
          conclusao: resultado.conclusao,
          resultado,
          evidencias_resumo: resumoEvidencias(pacote),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          duracao_ms: Date.now() - inicio,
          concluida_em: new Date().toISOString(),
        })
        .eq("id", criada.id)
        .select(COLUNAS)
        .single();
      if (eUpd) throw new Error(eUpd.message);
      return { analise: fim as Analise, jaExistia: false as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha desconhecida na análise.";
      // Estado de falha explícito: nunca gravar resultado falso.
      const { data: falhou } = await supabase
        .from("nina_feedback_analises")
        .update({
          status: "failed",
          erro: msg.slice(0, 500),
          duracao_ms: Date.now() - inicio,
          concluida_em: new Date().toISOString(),
        })
        .eq("id", criada.id)
        .select(COLUNAS)
        .single();
      return { analise: (falhou ?? null) as Analise | null, jaExistia: false as const, erro: msg };
    }
  });
