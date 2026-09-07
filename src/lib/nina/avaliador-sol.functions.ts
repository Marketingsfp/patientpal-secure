/**
 * FASE 7 — Backend da avaliação automática da homologação (GPT Sol como juiz).
 *
 * O dossiê é montado SOMENTE com registros já existentes daquela execução:
 * mensagens da conversa de teste, chamadas e resultados reais de ferramentas
 * (ground truth), consultas ao conhecimento, execuções, eventos de trace e a
 * versão publicada das Instruções da Nina usada. O texto do Prompt Principal e
 * qualquer raciocínio interno da Nina NÃO são enviados ao avaliador.
 *
 * O avaliador não escreve em nada do atendimento: só grava a própria avaliação
 * em `nina_teste_avaliacoes`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MODELO_SOL,
  VERSAO_RUBRICA,
  montarInstrucoesSol,
  montarInputSol,
  parseAvaliacaoSol,
  type Dossie,
  type FerramentaDossie,
  type TurnoDossie,
} from "@/lib/nina/avaliador-sol";
import { TIPOS_CRITERIO } from "@/lib/nina/cenarios";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

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

/** Chamada ao avaliador (Responses API, sem armazenamento no provedor). */
async function chamarSol(
  instrucoes: string,
  input: unknown[],
): Promise<{ texto: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Avaliação indisponível: chave do provedor de IA não configurada.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODELO_SOL,
      instructions: instrucoes,
      input,
      stream: true,
      store: false,
      max_output_tokens: 4000,
    }),
  });

  if (!res.ok || !res.body) {
    const corpo = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Integração de IA não configurada corretamente.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados para esta avaliação.");
    if (res.status === 403) throw new Error("Uso de IA bloqueado para esta área de trabalho.");
    if (res.status === 429) throw new Error("Limite de uso do modelo atingido. Tente mais tarde.");
    if (res.status === 400 && /model/i.test(corpo))
      throw new Error(`Modelo ${MODELO_SOL} indisponível no provedor deste projeto.`);
    throw new Error(`Falha do provedor (${res.status}). Avaliação interrompida.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let texto = "";
  let inputTokens = 0;
  let outputTokens = 0;

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
      if (ev.type === "response.output_text.delta" && typeof ev.delta === "string")
        texto += ev.delta;
      if (ev.type === "response.completed" && ev.response) {
        if (!texto && typeof ev.response.output_text === "string") texto = ev.response.output_text;
        inputTokens = ev.response.usage?.input_tokens ?? 0;
        outputTokens = ev.response.usage?.output_tokens ?? 0;
      }
    }
  }

  return { texto, inputTokens, outputTokens };
}

/** Monta o dossiê de evidências de uma conversa de homologação. */
async function montarDossie(
  admin: any,
  clinicaId: string,
  conversaId: string,
  cenario: { texto: string | null; objetivo: string | null; criterios: string[] },
): Promise<{ dossie: Dossie; execucaoIds: string[]; promptVersao: number | null; promptVersaoId: string | null }> {
  const { data: msgs } = await admin
    .from("whatsapp_mensagens")
    .select("id, direction, body, created_at, execucao_id")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true })
    .limit(120);

  const turnos: TurnoDossie[] = ((msgs ?? []) as any[]).map((m) => ({
    autor: m.direction === "in" ? "paciente" : "nina",
    texto: String(m.body ?? ""),
    em: String(m.created_at),
    execucaoId: m.execucao_id ?? null,
  }));

  const { data: eventosConversa } = await admin
    .from("atend_conversa_eventos")
    .select("evento, motivo, created_at")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true })
    .limit(60);

  // Ferramentas: argumentos e RESULTADO REAL devolvido pelo backend. É o que
  // permite conferir "havia mesmo 14h?" sem deixar o avaliador inventar.
  const { data: linhasTool } = await admin
    .from("audit_log")
    .select("created_at, dados_depois")
    .eq("clinica_id", clinicaId)
    .eq("action", "NINA_TOOL")
    .order("created_at", { ascending: false })
    .limit(300);

  const ferramentas: FerramentaDossie[] = ((linhasTool ?? []) as any[])
    .filter((l) => l?.dados_depois?.conversa_id === conversaId)
    .map((l) => {
      const d = l.dados_depois ?? {};
      const entrada = d.entrada ?? {};
      return {
        ferramenta: String(entrada.ferramenta ?? d.ferramenta ?? "?"),
        argumentos: entrada.argumentos ?? null,
        resposta: entrada.resposta ?? null,
        ok: Boolean(d.ok),
        erro: (d.erro as string | null) ?? null,
        em: String(l.created_at),
      };
    })
    .reverse();

  const { data: execs } = await admin
    .from("nina_execucoes")
    .select(
      "id, model, success, error_category, handoff, tool_calls, knowledge_status, prompt_versao, prompt_versao_id, created_at",
    )
    .eq("clinica_id", clinicaId)
    .eq("conversation_id", conversaId)
    .order("created_at", { ascending: true })
    .limit(60);

  const execucoes = ((execs ?? []) as any[]).map((e) => ({
    id: String(e.id),
    modelo: e.model ?? null,
    sucesso: e.success ?? null,
    erro: e.error_category ?? null,
    handoff: e.handoff ?? null,
    ferramentas: (e.tool_calls ?? []) as string[],
    conhecimento: e.knowledge_status ?? null,
    promptVersao: e.prompt_versao ?? null,
  }));
  const execucaoIds = execucoes.map((e) => e.id);
  const ultima = ((execs ?? []) as any[]).at(-1) ?? null;

  // Consultas ao conhecimento/catálogo registradas nas evidências (sem
  // raciocínio interno: só o que foi consultado e o que voltou).
  const conhecimento: Dossie["conhecimento"] = [];
  if (execucaoIds.length) {
    const { data: evid } = await admin
      .from("nina_execucao_evidencias")
      .select("etapas")
      .in("execucao_id", execucaoIds.slice(-10));
    for (const linha of (evid ?? []) as any[]) {
      for (const etapa of (linha?.etapas ?? []) as any[]) {
        if (etapa?.tipo !== "consulta") continue;
        const dados = etapa.dados ?? {};
        const registros: string[] = Array.isArray(dados.encontrados)
          ? dados.encontrados.map((r: any) => String(r?.nome ?? r?.id ?? "")).filter(Boolean)
          : Array.isArray(dados.selecionados)
            ? dados.selecionados.map((r: any) => String(r))
            : [];
        conhecimento.push({
          consulta: String(etapa.titulo ?? dados.secao ?? "consulta"),
          status: dados.knowledgeStatus ?? null,
          registros: registros.slice(0, 30),
        });
      }
    }
  }

  let eventos: Dossie["eventos"] = [];
  if (execucaoIds.length) {
    const { data: tr } = await admin
      .from("nina_trace_eventos")
      .select("node_id, event_type, status, started_at")
      .eq("clinica_id", clinicaId)
      .in("execution_id", execucaoIds.slice(-5))
      .order("started_at", { ascending: true })
      .limit(150);
    eventos = ((tr ?? []) as any[]).map((e) => ({
      node: String(e.node_id),
      tipo: String(e.event_type),
      status: String(e.status ?? ""),
      em: String(e.started_at),
    }));
  }

  const resultadoFinal =
    ((eventosConversa ?? []) as any[])
      .map((e) => `${e.created_at}: ${e.evento}${e.motivo ? ` (${e.motivo})` : ""}`)
      .join(" | ") || null;

  const dossie: Dossie = {
    cenario: cenario.texto,
    objetivo: cenario.objetivo,
    criteriosEsperados: cenario.criterios,
    instrucoes: {
      versao: ultima?.prompt_versao ?? null,
      publicadoEm: ultima?.prompt_publicado_em ?? null,
      origem: ultima?.prompt_origem ?? null,
    },
    turnos,
    ferramentas,
    conhecimento: conhecimento.slice(0, 40),
    eventos,
    execucoes,
    resultadoFinal,
  };

  return {
    dossie,
    execucaoIds,
    promptVersao: ultima?.prompt_versao ?? null,
    promptVersaoId: ultima?.prompt_versao_id ?? null,
  };
}

function descreverCriterio(c: any): string {
  const rotulo = TIPOS_CRITERIO.find((t) => t.valor === c?.tipo)?.rotulo ?? String(c?.tipo ?? "");
  return c?.valor ? `${rotulo}: ${c.valor}` : rotulo;
}

/** Avalia com o Sol a conversa atual de um Lead de Teste. */
export const avaliarComSol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid(),
        cenarioId: z.string().uuid().nullish(),
        cenarioTexto: z.string().trim().max(600).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead, error: eLead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("id, indice, conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.leadId)
      .maybeSingle();
    if (eLead) throw new Error(eLead.message);
    if (!lead) throw new Error("Lead de teste não encontrado nesta clínica");
    const conversaId = (lead as any).conversa_id as string | null;
    if (!conversaId) throw new Error("Este lead ainda não tem conversa de teste para avaliar.");

    // Cenário: o cadastrado na biblioteca (com critérios) ou o texto livre da
    // simulação Terra em curso. O avaliador nunca inventa o esperado.
    let cenarioTexto: string | null = data.cenarioTexto ?? null;
    let objetivo: string | null = null;
    let criterios: string[] = [];
    let cenarioId: string | null = data.cenarioId ?? null;

    if (cenarioId) {
      const { data: cen } = await supabaseAdmin
        .from("nina_teste_cenarios")
        .select("id, nome, descricao, objetivo, criterios")
        .eq("clinica_id", data.clinicaId)
        .eq("id", cenarioId)
        .maybeSingle();
      if (!cen) throw new Error("Cenário não encontrado nesta clínica");
      cenarioTexto = [(cen as any).nome, (cen as any).descricao].filter(Boolean).join(" — ");
      objetivo = (cen as any).objetivo ?? null;
      criterios = (((cen as any).criterios ?? []) as any[]).map(descreverCriterio);
    }

    let simulacaoId: string | null = null;
    const { data: sim } = await supabaseAdmin
      .from("nina_teste_simulacoes")
      .select("id, cenario")
      .eq("clinica_id", data.clinicaId)
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sim) {
      simulacaoId = (sim as any).id;
      if (!cenarioTexto) cenarioTexto = (sim as any).cenario ?? null;
    }

    const inicio = Date.now();
    const { dossie, promptVersao, promptVersaoId } = await montarDossie(
      supabaseAdmin,
      data.clinicaId,
      conversaId,
      { texto: cenarioTexto, objetivo, criterios },
    );

    if (dossie.turnos.length === 0)
      throw new Error("Não há mensagens nesta conversa de teste para avaliar.");

    const base = {
      clinica_id: data.clinicaId,
      lead_id: data.leadId,
      conversa_id: conversaId,
      ciclo_id: (lead as any).ciclo_id ?? null,
      simulacao_id: simulacaoId,
      cenario_id: cenarioId,
      modelo: MODELO_SOL,
      versao_rubrica: VERSAO_RUBRICA,
      prompt_versao: promptVersao,
      prompt_versao_id: promptVersaoId,
      mensagens_avaliadas: dossie.turnos.length,
      criado_por: context.userId,
    };

    try {
      const { texto, inputTokens, outputTokens } = await chamarSol(
        montarInstrucoesSol(),
        montarInputSol(dossie),
      );
      const avaliacao = parseAvaliacaoSol(texto);

      const { data: linha, error } = await supabaseAdmin
        .from("nina_teste_avaliacoes")
        .insert({
          ...base,
          status: "concluida",
          resultado: avaliacao.resultado,
          score: avaliacao.score,
          resumo: avaliacao.resumo,
          dimensoes: avaliacao.dimensoes as never,
          achados: avaliacao.achados as never,
          evidencias: {
            turnos: dossie.turnos.length,
            ferramentas: dossie.ferramentas.map((f) => f.ferramenta),
            execucoes: dossie.execucoes.map((e) => e.id),
            conhecimento: dossie.conhecimento.length,
            eventos: dossie.eventos.length,
            criterios: dossie.criteriosEsperados,
            lacunas: avaliacao.lacunas,
          } as never,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          latency_ms: Date.now() - inicio,
        } as never)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { avaliacao: linha };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      await supabaseAdmin.from("nina_teste_avaliacoes").insert({
        ...base,
        status: "erro",
        erro: msg,
        latency_ms: Date.now() - inicio,
      } as never);
      throw new Error(msg);
    }
  });

/** Histórico de avaliações de um lead (ou da clínica inteira). */
export const listarAvaliacoesSol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid().nullish(),
        limite: z.number().int().min(1).max(50).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("nina_teste_avaliacoes")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(data.limite);
    if (data.leadId) q = q.eq("lead_id", data.leadId);
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    return { avaliacoes: (linhas ?? []) as any[] };
  });
