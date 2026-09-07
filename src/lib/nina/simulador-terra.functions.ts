/**
 * FASE 4 — Backend do simulador automático de pacientes (GPT Terra).
 *
 * Terra gera SOMENTE a próxima mensagem do paciente simulado. Quem responde
 * continua sendo a Nina real, pelo mesmo pipeline da homologação
 * (`enviarMensagemTeste`). Este módulo nunca chama ferramentas, nunca escreve
 * na agenda/CRM e nunca vê o Prompt Principal da Nina.
 *
 * A chave do provedor fica apenas no servidor (`LOVABLE_API_KEY`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LIMITES_MAXIMOS,
  MODELO_TERRA,
  montarInputTerra,
  montarInstrucoesTerra,
  normalizarLimites,
  pediuFim,
  podeContinuar,
  ROTULO_MOTIVO,
  sanitizarMensagemPaciente,
  type MotivoFim,
  type Persona,
  type TurnoConversa,
} from "@/lib/nina/simulador-terra";
import { garantirPapel, PROVEDOR_IA } from "@/lib/nina/papeis-modelos";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

const personaSchema = z.object({
  estilo: z.enum(["objetivo", "confuso", "apressado", "educado", "desconfiado"]).default("objetivo"),
  detalhe: z.enum(["curto", "medio", "detalhado"]).default("curto"),
  errosDigitacao: z.boolean().default(false),
  mudaDeAssunto: z.boolean().default(false),
  respondeParcialmente: z.boolean().default(false),
  objetivo: z.string().trim().max(300).nullish(),
});

const limitesSchema = z.object({
  maxTurnos: z.number().int().min(1).max(LIMITES_MAXIMOS.maxTurnos).default(8),
  maxMensagens: z.number().int().min(2).max(LIMITES_MAXIMOS.maxMensagens).default(40),
  maxDuracaoS: z.number().int().min(30).max(LIMITES_MAXIMOS.maxDuracaoS).default(300),
  maxTokens: z.number().int().min(500).max(LIMITES_MAXIMOS.maxTokens).default(20000),
  maxCustoCreditos: z.number().min(0).max(LIMITES_MAXIMOS.maxCustoCreditos).default(0),
  creditosPorMilTokens: z.number().min(0).max(LIMITES_MAXIMOS.creditosPorMilTokens).default(0),
  timeoutS: z.number().int().min(10).max(LIMITES_MAXIMOS.timeoutS).default(60),
});


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

async function carregarSimulacao(admin: any, clinicaId: string, id: string) {
  const { data, error } = await admin
    .from("nina_teste_simulacoes")
    .select(
      "id, clinica_id, lead_id, ciclo_id, conversa_id, cenario, persona, status, turnos, input_tokens, output_tokens, max_turnos, max_mensagens, max_duracao_s, max_tokens, max_custo_creditos, creditos_por_mil_tokens, timeout_s, created_at",
    )
    .eq("clinica_id", clinicaId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Simulação não encontrada nesta clínica");
  return data as any;
}

async function encerrar(admin: any, id: string, status: string, motivo: MotivoFim, erro?: string) {
  await admin
    .from("nina_teste_simulacoes")
    .update({
      status,
      motivo_fim: motivo,
      erro: erro ? erro.slice(0, 300) : null,
      finalizado_em: new Date().toISOString(),
    })
    .eq("id", id);
}

/** Chamada ao paciente simulado (Responses API, streaming consumido no servidor). */
async function chamarTerra(
  instrucoes: string,
  input: unknown[],
): Promise<{ texto: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Simulação indisponível: chave do provedor de IA não configurada.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: garantirPapel("paciente", MODELO_TERRA),
      instructions: instrucoes,
      input,
      stream: true,
      store: false,
      max_output_tokens: 400,
    }),
  });

  if (!res.ok || !res.body) {
    const corpo = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Integração de IA não configurada corretamente.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados para esta simulação.");
    if (res.status === 403) throw new Error("Uso de IA bloqueado para esta área de trabalho.");
    if (res.status === 429) throw new Error("Limite de uso do modelo atingido. Tente mais tarde.");
    if (res.status === 400 && /model/i.test(corpo))
      throw new Error(`Modelo ${MODELO_TERRA} indisponível no provedor deste projeto.`);
    throw new Error(`Falha do provedor (${res.status}). Simulação interrompida.`);
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

/** Cria a simulação de um lead. Não gera mensagem ainda. */
export const iniciarSimulacaoTerra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid(),
        cenario: z.string().trim().min(5).max(500),
        persona: personaSchema.default({}),
        limites: limitesSchema.default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead, error: eLead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("id, conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.leadId)
      .maybeSingle();
    if (eLead) throw new Error(eLead.message);
    if (!lead) throw new Error("Lead de teste não encontrado nesta clínica");

    // Uma simulação ativa por lead: nunca duas IAs disparando no mesmo lead.
    await supabaseAdmin
      .from("nina_teste_simulacoes")
      .update({
        status: "parada",
        motivo_fim: "operador",
        finalizado_em: new Date().toISOString(),
      })
      .eq("clinica_id", data.clinicaId)
      .eq("lead_id", data.leadId)
      .in("status", ["executando", "pausada"]);

    const limites = normalizarLimites(data.limites);
    const { data: nova, error } = await supabaseAdmin
      .from("nina_teste_simulacoes")
      .insert({
        clinica_id: data.clinicaId,
        lead_id: data.leadId,
        ciclo_id: (lead as any).ciclo_id ?? null,
        conversa_id: (lead as any).conversa_id ?? null,
        modelo: garantirPapel("paciente", MODELO_TERRA),
        provedor: PROVEDOR_IA,
        cenario: data.cenario,
        persona: data.persona,
        max_turnos: limites.maxTurnos,
        max_mensagens: limites.maxMensagens,
        max_duracao_s: limites.maxDuracaoS,
        max_tokens: limites.maxTokens,
        max_custo_creditos: limites.maxCustoCreditos,
        creditos_por_mil_tokens: limites.creditosPorMilTokens,
        timeout_s: limites.timeoutS,
        status: "executando",
        criado_por: context.userId,
      })
      .select("id, status, turnos, max_turnos, timeout_s")
      .maybeSingle();
    if (error) throw new Error(error.message);

    return { simulacao: nova };
  });

/** Pausar, retomar ou parar. Também usada pelo cliente ao detectar transferência. */
export const controlarSimulacaoTerra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        simulacaoId: z.string().uuid(),
        acao: z.enum(["pausar", "retomar", "parar", "concluir"]),
        motivo: z
          .enum([
            "objetivo_concluido",
            "limite_turnos",
            "limite_mensagens",
            "limite_duracao",
            "limite_tokens",
            "limite_custo",
            "transferencia",
            "erro",
            "timeout",
            "operador",
          ])
          .default("operador"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sim = await carregarSimulacao(supabaseAdmin, data.clinicaId, data.simulacaoId);

    if (data.acao === "pausar") {
      await supabaseAdmin.from("nina_teste_simulacoes").update({ status: "pausada" }).eq("id", sim.id);
      return { status: "pausada", motivo: null };
    }
    if (data.acao === "retomar") {
      if (sim.status !== "pausada") return { status: sim.status, motivo: sim.motivo_fim ?? null };
      await supabaseAdmin
        .from("nina_teste_simulacoes")
        .update({ status: "executando" })
        .eq("id", sim.id);
      return { status: "executando", motivo: null };
    }
    const status = data.acao === "concluir" ? "concluida" : "parada";
    await encerrar(supabaseAdmin, sim.id, status, data.motivo as MotivoFim);
    return { status, motivo: ROTULO_MOTIVO[data.motivo as MotivoFim] };
  });

/**
 * Gera a PRÓXIMA mensagem do paciente simulado.
 *
 * O histórico é lido do banco (conversa atual do lead), nunca do navegador:
 * assim o paciente simulado vê apenas o que um paciente veria e não é possível
 * injetar contexto pela tela.
 */
export const proximaMensagemTerra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), simulacaoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sim = await carregarSimulacao(supabaseAdmin, data.clinicaId, data.simulacaoId);

    if (sim.status === "pausada")
      return { encerrada: false, pausada: true, mensagem: null, motivo: null, turno: sim.turnos };

    const limites = normalizarLimites({
      maxTurnos: sim.max_turnos,
      maxMensagens: sim.max_mensagens,
      maxDuracaoS: sim.max_duracao_s,
      maxTokens: sim.max_tokens,
      maxCustoCreditos: Number(sim.max_custo_creditos ?? 0),
      creditosPorMilTokens: Number(sim.creditos_por_mil_tokens ?? 0),
      timeoutS: sim.timeout_s,
    });

    // Mensagens já trocadas na conversa do lead (paciente + Nina).
    let mensagensConversa = 0;
    if (sim.conversa_id) {
      const { count } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", sim.conversa_id);
      mensagensConversa = count ?? 0;
    }
    const guarda = podeContinuar(
      {
        status: sim.status,
        turnos: sim.turnos,
        mensagens: mensagensConversa,
        inputTokens: sim.input_tokens,
        outputTokens: sim.output_tokens,
        iniciadaEm: new Date(sim.created_at).getTime(),
        limites,
      },
      Date.now(),
    );
    if (!guarda.ok) {
      const status = guarda.motivo === "operador" ? "parada" : "concluida";
      await encerrar(supabaseAdmin, sim.id, status, guarda.motivo);
      return {
        encerrada: true,
        pausada: false,
        mensagem: null,
        motivo: ROTULO_MOTIVO[guarda.motivo],
        turno: sim.turnos,
      };
    }

    // Histórico visto pelo paciente: só a conversa do ciclo atual do lead.
    const { data: lead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", sim.lead_id)
      .maybeSingle();

    let historico: TurnoConversa[] = [];
    const conversaId = (lead as any)?.conversa_id ?? null;
    if (conversaId) {
      const { data: msgs } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .select("direction, body, enviada_por, created_at")
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", conversaId)
        .order("created_at", { ascending: false })
        .limit(40);
      historico = ((msgs ?? []) as any[])
        .slice()
        .reverse()
        .filter((m) => (m.body ?? "").trim() && m.enviada_por !== "sistema")
        .map((m) => ({
          autor: m.direction === "out" ? ("nina" as const) : ("paciente" as const),
          texto: String(m.body),
        }));
    }

    let saida: { texto: string; inputTokens: number; outputTokens: number };
    try {
      saida = await chamarTerra(
        montarInstrucoesTerra(sim.cenario, sim.persona as Persona, limites),
        montarInputTerra(historico),
      );
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      await encerrar(supabaseAdmin, sim.id, "erro", "erro", msg);
      return { encerrada: true, pausada: false, mensagem: null, motivo: msg, turno: sim.turnos };
    }

    const tokensTotais =
      sim.input_tokens + sim.output_tokens + saida.inputTokens + saida.outputTokens;

    if (pediuFim(saida.texto) || !sanitizarMensagemPaciente(saida.texto)) {
      await supabaseAdmin
        .from("nina_teste_simulacoes")
        .update({
          input_tokens: sim.input_tokens + saida.inputTokens,
          output_tokens: sim.output_tokens + saida.outputTokens,
          status: "concluida",
          motivo_fim: "objetivo_concluido",
          finalizado_em: new Date().toISOString(),
        })
        .eq("id", sim.id);
      return {
        encerrada: true,
        pausada: false,
        mensagem: null,
        motivo: ROTULO_MOTIVO.objetivo_concluido,
        turno: sim.turnos,
      };
    }

    const mensagem = sanitizarMensagemPaciente(saida.texto);
    const turno = sim.turnos + 1;
    await supabaseAdmin
      .from("nina_teste_simulacoes")
      .update({
        turnos: turno,
        input_tokens: sim.input_tokens + saida.inputTokens,
        output_tokens: sim.output_tokens + saida.outputTokens,
        conversa_id: conversaId,
        ciclo_id: (lead as any)?.ciclo_id ?? sim.ciclo_id,
      })
      .eq("id", sim.id);

    return {
      encerrada: false,
      pausada: false,
      mensagem,
      motivo: null,
      turno,
      tokens: tokensTotais,
      timeoutS: limites.timeoutS,
      maxTurnos: limites.maxTurnos,
    };
  });

/** Situação atual da simulação de um lead (para reabrir a tela sem perder estado). */
export const simulacaoAtualTerra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linha } = await supabaseAdmin
      .from("nina_teste_simulacoes")
      .select(
        "id, status, cenario, persona, turnos, max_turnos, max_mensagens, max_duracao_s, max_tokens, max_custo_creditos, creditos_por_mil_tokens, timeout_s, input_tokens, output_tokens, motivo_fim, erro, modelo, created_at, finalizado_em",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { simulacao: linha ?? null };
  });
