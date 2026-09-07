/**
 * FASE 11 — Backend do dashboard da homologação.
 *
 * SOMENTE LEITURA. Nenhuma estrutura nova: lê o que já existe e devolve o
 * resumo do período. Só entram conversas de homologação (`atend_conversas.is_teste`),
 * portanto nada aqui se mistura com o atendimento real.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  agregarPorConversa,
  filtrarTestes,
  resumirTestes,
  resumirPorVersaoPrompt,
  type EntradaDashboard,
  type ExecucaoDash,
  type FerramentaDash,
  type AvaliacaoDash,
} from "@/lib/nina/dashboard-homologacao";
import type { TipoRelatorio } from "@/lib/nina/relatorio-teste";

type Ctx = { supabase: any; userId: string };

async function assertMembership(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

export const dashboardHomologacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        de: z.string().optional(),
        ate: z.string().optional(),
        tipos: z.array(z.enum(["manual", "terra", "cenarios", "carga"])).optional(),
        promptVersao: z.number().int().nullable().optional(),
        modelo: z.string().nullable().optional(),
        resultado: z.string().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const agora = new Date();
    const de = data.de ? new Date(`${data.de}T00:00:00.000Z`).toISOString() : new Date(agora.getTime() - 30 * 86400000).toISOString();
    const ate = data.ate ? new Date(`${data.ate}T23:59:59.999Z`).toISOString() : agora.toISOString();

    // 1) Conversas de homologação da clínica (nunca conversas reais).
    const { data: conversasRaw, error: errConv } = await supabaseAdmin
      .from("atend_conversas")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .eq("is_teste", true)
      .limit(5000);
    if (errConv) throw new Error(errConv.message);
    const idsTeste = new Set(((conversasRaw ?? []) as any[]).map((c) => String(c.id)));
    if (!idsTeste.size) {
      const vazio = resumirTestes([]);
      return { periodo: { de, ate }, resumo: vazio, porVersaoPrompt: [], modelos: [], versoes: [] };
    }
    const listaIds = [...idsTeste];

    // 2) Execuções reais da Nina nessas conversas, dentro do período.
    const execucoesRaw: any[] = [];
    for (let i = 0; i < listaIds.length; i += 200) {
      const fatia = listaIds.slice(i, i + 200);
      const { data: parte } = await supabaseAdmin
        .from("nina_execucoes")
        .select(
          "conversation_id,model,success,error_category,handoff,knowledge_status,input_tokens,output_tokens,latency_ms,prompt_versao,created_at",
        )
        .eq("clinica_id", data.clinicaId)
        .in("conversation_id", fatia)
        .gte("created_at", de)
        .lte("created_at", ate)
        .limit(5000);
      execucoesRaw.push(...((parte ?? []) as any[]));
    }

    const conversasComExecucao = [...new Set(execucoesRaw.map((e) => String(e.conversation_id)))];
    if (!conversasComExecucao.length) {
      const vazio = resumirTestes([]);
      return { periodo: { de, ate }, resumo: vazio, porVersaoPrompt: [], modelos: [], versoes: [] };
    }

    // 3) Origem de cada conversa de teste (Terra, cenários, carga ou manual).
    const [simulacoes, itensCenario, amostras, avaliacoesRaw, ferramentasRaw] = await Promise.all([
      supabaseAdmin
        .from("nina_teste_simulacoes")
        .select("conversa_id")
        .eq("clinica_id", data.clinicaId)
        .in("conversa_id", conversasComExecucao),
      supabaseAdmin
        .from("nina_teste_execucao_itens")
        .select("conversa_id,custo_estimado")
        .eq("clinica_id", data.clinicaId)
        .in("conversa_id", conversasComExecucao),
      supabaseAdmin
        .from("nina_teste_carga_amostras")
        .select("conversa_id")
        .eq("clinica_id", data.clinicaId)
        .in("conversa_id", conversasComExecucao),
      supabaseAdmin
        .from("nina_teste_avaliacoes")
        .select("conversa_id,resultado,score,achados,created_at")
        .eq("clinica_id", data.clinicaId)
        .in("conversa_id", conversasComExecucao)
        .limit(2000),
      supabaseAdmin
        .from("audit_log")
        .select("dados_depois,created_at")
        .eq("clinica_id", data.clinicaId)
        .eq("action", "NINA_TOOL")
        .gte("created_at", de)
        .lte("created_at", ate)
        .limit(5000),
    ]);

    const tipoPorConversa: Record<string, TipoRelatorio> = {};
    for (const id of conversasComExecucao) tipoPorConversa[id] = "manual";
    for (const a of ((amostras.data ?? []) as any[])) if (a.conversa_id) tipoPorConversa[String(a.conversa_id)] = "carga";
    for (const c of ((itensCenario.data ?? []) as any[])) if (c.conversa_id) tipoPorConversa[String(c.conversa_id)] = "cenarios";
    for (const s of ((simulacoes.data ?? []) as any[])) if (s.conversa_id) tipoPorConversa[String(s.conversa_id)] = "terra";

    const custoPorConversa: Record<string, number> = {};
    for (const c of ((itensCenario.data ?? []) as any[])) {
      if (c.conversa_id && typeof c.custo_estimado === "number") {
        custoPorConversa[String(c.conversa_id)] =
          (custoPorConversa[String(c.conversa_id)] ?? 0) + c.custo_estimado;
      }
    }

    const execucoes: ExecucaoDash[] = execucoesRaw.map((e) => ({
      conversaId: String(e.conversation_id),
      quando: String(e.created_at),
      modelo: e.model ?? null,
      promptVersao: typeof e.prompt_versao === "number" ? e.prompt_versao : null,
      sucesso: e.success !== false,
      erroCategoria: e.error_category ?? null,
      handoff: e.handoff === true,
      conhecimento: e.knowledge_status ?? null,
      inputTokens: e.input_tokens ?? 0,
      outputTokens: e.output_tokens ?? 0,
      latenciaMs: typeof e.latency_ms === "number" ? e.latency_ms : null,
    }));

    const ferramentas: FerramentaDash[] = ((ferramentasRaw.data ?? []) as any[])
      .map((f) => ({
        conversaId: String(f.dados_depois?.conversa_id ?? ""),
        nome: f.dados_depois?.entrada?.ferramenta ?? null,
        ok: f.dados_depois?.ok !== false,
        erro: f.dados_depois?.erro ?? null,
        quando: String(f.created_at),
      }))
      .filter((f) => tipoPorConversa[f.conversaId] !== undefined);

    const avaliacoes: AvaliacaoDash[] = ((avaliacoesRaw.data ?? []) as any[]).map((a) => ({
      conversaId: String(a.conversa_id),
      quando: String(a.created_at),
      resultado: a.resultado ?? null,
      score: typeof a.score === "number" ? a.score : null,
      achados: (a.achados ?? []) as any[],
    }));

    const entrada: EntradaDashboard = {
      tipoPorConversa,
      execucoes,
      ferramentas,
      avaliacoes,
      custoPorConversa,
    };

    const todos = agregarPorConversa(entrada);
    const filtrados = filtrarTestes(todos, {
      tipos: data.tipos,
      promptVersao: data.promptVersao ?? null,
      modelo: data.modelo ?? null,
      resultado: data.resultado ?? null,
    });

    const modelos = [...new Set(todos.flatMap((t) => t.modelos))].sort();
    const versoes = [
      ...new Set(todos.map((t) => t.promptVersao).filter((v): v is number => typeof v === "number")),
    ].sort((a, b) => b - a);

    return {
      periodo: { de, ate },
      resumo: resumirTestes(filtrados),
      porVersaoPrompt: resumirPorVersaoPrompt(filtrados),
      modelos,
      versoes,
    };
  });
