/**
 * FASE 5 — Backend da biblioteca de cenários automatizados.
 *
 * Cada execução em lote (test run) distribui os cenários entre os 10 Leads de
 * Teste, roda cada cenário no MESMO pipeline real da Nina (via console de
 * homologação) e registra o que foi usado: cenário, lead, conversa, ciclo,
 * modelo da Nina, versão das instruções, ferramentas, tokens, resultado.
 *
 * A avaliação do resultado é determinística (sem IA avaliadora).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  avaliarCenario,
  distribuirCenarios,
  type Criterio,
} from "@/lib/nina/cenarios";
import { MODELO_TERRA } from "@/lib/nina/simulador-terra";

type Ctx = { supabase: any; userId: string };

const CANAL_TESTE = "test-console";

function telefoneSessao(indice: number, sessao: number) {
  return `5500${String(indice).padStart(2, "0")}${String(sessao).padStart(5, "0")}`;
}

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

const criterioSchema = z.object({
  tipo: z.enum([
    "contem_texto",
    "nao_contem_texto",
    "usou_ferramenta",
    "nao_usou_ferramenta",
    "transferiu",
    "nao_transferiu",
    "sem_erro",
  ]),
  valor: z.string().trim().max(200).nullish(),
});

const cenarioSchema = z.object({
  clinicaId: z.string().uuid(),
  id: z.string().uuid().nullish(),
  nome: z.string().trim().min(3).max(120),
  descricao: z.string().trim().max(1000).nullish(),
  categoria: z.enum([
    "informacao",
    "agendamento",
    "agenda",
    "crm",
    "rag",
    "transferencia",
    "prompt",
    "memoria",
    "correcao_dados",
    "fallback",
    "erro",
    "seguranca",
    "regressao",
  ]),
  objetivo: z.string().trim().min(5).max(600),
  precondicoes: z.string().trim().max(1000).nullish(),
  dadosSinteticos: z.record(z.string(), z.any()).default({}),
  criterios: z.array(criterioSchema).max(20).default([]),
  persona: z.record(z.string(), z.any()).default({}),
  maxTurnos: z.number().int().min(1).max(20).default(6),
  tags: z.array(z.string().trim().max(30)).max(15).default([]),
  status: z.enum(["rascunho", "ativo", "arquivado"]).default("ativo"),
});

/** Lista os cenários da clínica. */
export const listarCenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { data: linhas, error } = await context.supabase
      .from("nina_teste_cenarios")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("categoria", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return { cenarios: linhas ?? [] };
  });

/** Cria ou atualiza um cenário. Atualizar incrementa a versão do cenário. */
export const salvarCenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cenarioSchema.parse(input))
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const campos = {
      clinica_id: data.clinicaId,
      nome: data.nome,
      descricao: data.descricao ?? null,
      categoria: data.categoria,
      objetivo: data.objetivo,
      precondicoes: data.precondicoes ?? null,
      dados_sinteticos: data.dadosSinteticos,
      criterios: data.criterios,
      persona: data.persona,
      max_turnos: data.maxTurnos,
      tags: data.tags,
      status: data.status,
    };

    if (data.id) {
      const { data: atual, error: eAtual } = await context.supabase
        .from("nina_teste_cenarios")
        .select("versao")
        .eq("clinica_id", data.clinicaId)
        .eq("id", data.id)
        .maybeSingle();
      if (eAtual) throw new Error(eAtual.message);
      if (!atual) throw new Error("Cenário não encontrado nesta clínica");
      const { data: linha, error } = await context.supabase
        .from("nina_teste_cenarios")
        .update({ ...campos, versao: (atual as any).versao + 1 })
        .eq("id", data.id)
        .eq("clinica_id", data.clinicaId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { cenario: linha };
    }

    const { data: linha, error } = await context.supabase
      .from("nina_teste_cenarios")
      .insert({ ...campos, criado_por: context.userId })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { cenario: linha };
  });

/** Arquiva (não apaga) um cenário. */
export const arquivarCenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase
      .from("nina_teste_cenarios")
      .update({ status: "arquivado" })
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Carga inicial da biblioteca com cenários modelo (dados sintéticos). */
export const semearCenariosModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { CENARIOS_MODELO } = await import("@/lib/nina/cenarios");
    const { data: existentes } = await context.supabase
      .from("nina_teste_cenarios")
      .select("nome")
      .eq("clinica_id", data.clinicaId);
    const nomes = new Set(((existentes ?? []) as any[]).map((c) => c.nome));
    const novos = CENARIOS_MODELO.filter((c) => !nomes.has(c.nome)).map((c) => ({
      clinica_id: data.clinicaId,
      nome: c.nome,
      descricao: c.descricao,
      categoria: c.categoria,
      objetivo: c.objetivo,
      criterios: c.criterios,
      max_turnos: c.maxTurnos,
      tags: ["modelo"],
      criado_por: context.userId,
    }));
    if (!novos.length) return { criados: 0 };
    const { error } = await context.supabase.from("nina_teste_cenarios").insert(novos);
    if (error) throw new Error(error.message);
    return { criados: novos.length };
  });

/**
 * Cria a execução em lote (test_run_id) e distribui os cenários entre os leads.
 * Guarda a configuração usada para permitir reproduzir o mesmo teste depois.
 */
export const criarExecucaoCenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        cenarioIds: z.array(z.string().uuid()).min(1).max(50),
        nome: z.string().trim().max(120).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cenarios, error: eCen } = await supabaseAdmin
      .from("nina_teste_cenarios")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .in("id", data.cenarioIds);
    if (eCen) throw new Error(eCen.message);
    if (!cenarios?.length) throw new Error("Nenhum cenário válido para executar");

    const { data: leads, error: eLead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("id, indice, nome")
      .eq("clinica_id", data.clinicaId)
      .order("indice", { ascending: true });
    if (eLead) throw new Error(eLead.message);
    if (!leads?.length) throw new Error("Leads de teste ainda não foram criados nesta clínica");

    // Configuração da execução — o que estava valendo no momento do teste.
    const { data: instrucao } = await supabaseAdmin
      .from("nina_instrucoes_versoes")
      .select("id, versao, escopo, publicado_em")
      .is("clinica_id", null)
      .eq("escopo", "whatsapp")
      .eq("status", "publicada")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ordenados = data.cenarioIds
      .map((id: string) => (cenarios as any[]).find((c) => c.id === id))
      .filter(Boolean) as any[];
    const distribuicao = distribuirCenarios(ordenados, leads as any[]);

    const { data: execucao, error: eExec } = await supabaseAdmin
      .from("nina_teste_execucoes")
      .insert({
        clinica_id: data.clinicaId,
        nome: data.nome?.trim() || `Execução de ${ordenados.length} cenário(s)`,
        status: "executando",
        total: distribuicao.length,
        criado_por: context.userId,
        config: {
          modelo_paciente: MODELO_TERRA,
          instrucoes_versao: (instrucao as any)?.versao ?? null,
          instrucoes_versao_id: (instrucao as any)?.id ?? null,
          instrucoes_publicado_em: (instrucao as any)?.publicado_em ?? null,
          leads_usados: leads.length,
          cenarios: ordenados.map((c) => ({ id: c.id, nome: c.nome, versao: c.versao })),
        },
      })
      .select("*")
      .maybeSingle();
    if (eExec) throw new Error(eExec.message);

    const itens = distribuicao.map((d) => ({
      clinica_id: data.clinicaId,
      execucao_id: (execucao as any).id,
      cenario_id: d.cenario.id,
      cenario_snapshot: d.cenario,
      lead_id: d.lead.id,
      lead_indice: (d.lead as any).indice,
      ordem: d.ordem,
      status: "pendente",
      modelo_paciente: MODELO_TERRA,
      prompt_versao: (instrucao as any)?.versao ?? null,
      prompt_versao_id: (instrucao as any)?.id ?? null,
    }));
    const { data: criados, error: eItens } = await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .insert(itens)
      .select("*");
    if (eItens) throw new Error(eItens.message);

    return { execucao, itens: criados ?? [] };
  });

/**
 * Prepara o lead para o cenário: encerra o ciclo anterior (histórico
 * preservado) e abre uma simulação de paciente para este item.
 */
export const iniciarItemExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), itemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item, error: eItem } = await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.itemId)
      .maybeSingle();
    if (eItem) throw new Error(eItem.message);
    if (!item) throw new Error("Item de execução não encontrado nesta clínica");

    const { data: lead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("id, indice, nome, sessao_seq, conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", (item as any).lead_id)
      .maybeSingle();
    if (!lead) throw new Error("Lead de teste não encontrado");

    // Ciclo limpo: cada cenário começa sem memória do cenário anterior.
    const agora = new Date().toISOString();
    if ((lead as any).conversa_id) {
      await supabaseAdmin
        .from("atend_conversas")
        .update({
          status: "finished",
          owner_type: "NONE",
          ai_enabled: false,
          nina_fluxo_estado: null,
          patient_response_deadline: null,
          closed_at: agora,
          resolved_at: agora,
        })
        .eq("clinica_id", data.clinicaId)
        .eq("id", (lead as any).conversa_id);
    }
    if ((lead as any).ciclo_id) {
      await supabaseAdmin
        .from("nina_teste_ciclos")
        .update({ status: "resolvido", resolved_at: agora, resolvido_por: context.userId })
        .eq("clinica_id", data.clinicaId)
        .eq("id", (lead as any).ciclo_id);
    }
    const proxima = ((lead as any).sessao_seq ?? 1) + 1;
    await supabaseAdmin
      .from("nina_teste_leads")
      .update({
        sessao_seq: proxima,
        telefone_sessao: telefoneSessao((lead as any).indice, proxima),
        conversa_id: null,
        ciclo_id: null,
        ciclo_iniciado_em: null,
        resolvido_em: agora,
        status: "ativa",
      })
      .eq("id", (lead as any).id);

    // Simulação de paciente ligada a este item (mesmo motor da Fase 4).
    const cenario = (item as any).cenario_snapshot ?? {};
    const persona = {
      estilo: cenario?.persona?.estilo ?? "objetivo",
      detalhe: cenario?.persona?.detalhe ?? "curto",
      errosDigitacao: !!cenario?.persona?.errosDigitacao,
      mudaDeAssunto: !!cenario?.persona?.mudaDeAssunto,
      respondeParcialmente: !!cenario?.persona?.respondeParcialmente,
      objetivo: cenario?.objetivo ?? null,
    };
    const maxTurnos = Math.min(Math.max(Number(cenario?.max_turnos ?? 6), 1), 20);

    await supabaseAdmin
      .from("nina_teste_simulacoes")
      .update({ status: "parada", finalizado_em: agora, motivo_fim: "operador" })
      .eq("clinica_id", data.clinicaId)
      .eq("lead_id", (lead as any).id)
      .in("status", ["executando", "pausada"]);

    const cenarioTexto = [cenario?.objetivo, cenario?.precondicoes].filter(Boolean).join(" ");
    const { data: simulacao, error: eSim } = await supabaseAdmin
      .from("nina_teste_simulacoes")
      .insert({
        clinica_id: data.clinicaId,
        lead_id: (lead as any).id,
        modelo: MODELO_TERRA,
        cenario: cenarioTexto || "Paciente entra em contato com a clínica.",
        persona,
        max_turnos: maxTurnos,
        max_duracao_s: 300,
        max_tokens: 20000,
        timeout_s: 60,
        status: "executando",
        criado_por: context.userId,
      })
      .select("id, max_turnos")
      .maybeSingle();
    if (eSim) throw new Error(eSim.message);

    await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .update({
        status: "executando",
        simulacao_id: (simulacao as any).id,
        iniciado_em: agora,
      })
      .eq("id", (item as any).id);

    return {
      simulacaoId: (simulacao as any).id,
      leadId: (lead as any).id,
      leadIndice: (lead as any).indice,
      maxTurnos,
    };
  });

/**
 * Fecha o item: lê do banco o que realmente aconteceu (mensagens, ferramentas,
 * modelo, tokens, transferência, erros) e avalia os critérios do cenário.
 */
export const finalizarItemExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        itemId: z.string().uuid(),
        erroCliente: z.string().trim().max(300).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item } = await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item de execução não encontrado nesta clínica");

    const { data: lead } = await supabaseAdmin
      .from("nina_teste_leads")
      .select("conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", (item as any).lead_id)
      .maybeSingle();
    const conversaId = (lead as any)?.conversa_id ?? null;

    let respostasNina: string[] = [];
    let mensagens = 0;
    if (conversaId) {
      const { data: msgs } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .select("direction, body, enviada_por")
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", conversaId)
        .order("created_at", { ascending: true });
      const lista = ((msgs ?? []) as any[]).filter((m) => (m.body ?? "").trim());
      mensagens = lista.length;
      respostasNina = lista.filter((m) => m.direction === "out").map((m) => String(m.body));
    }

    let ferramentas: string[] = [];
    let transferida = false;
    let houveErro = !!data.erroCliente;
    let inputTokens = 0;
    let outputTokens = 0;
    let modeloNina: string | null = null;
    let promptVersao: number | null = (item as any).prompt_versao ?? null;
    let promptVersaoId: string | null = (item as any).prompt_versao_id ?? null;

    if (conversaId) {
      const { data: execs } = await supabaseAdmin
        .from("nina_execucoes")
        .select(
          "model, tool_calls, handoff, success, input_tokens, output_tokens, prompt_versao, prompt_versao_id, created_at",
        )
        .eq("clinica_id", data.clinicaId)
        .eq("conversation_id", conversaId)
        .order("created_at", { ascending: true });
      for (const e of (execs ?? []) as any[]) {
        ferramentas.push(...((e.tool_calls ?? []) as string[]));
        if (e.handoff) transferida = true;
        if (e.success === false) houveErro = true;
        inputTokens += e.input_tokens ?? 0;
        outputTokens += e.output_tokens ?? 0;
        modeloNina = e.model ?? modeloNina;
        promptVersao = e.prompt_versao ?? promptVersao;
        promptVersaoId = e.prompt_versao_id ?? promptVersaoId;
      }
      ferramentas = [...new Set(ferramentas)];
    }

    const { data: sim } = await supabaseAdmin
      .from("nina_teste_simulacoes")
      .select("turnos, input_tokens, output_tokens, status")
      .eq("id", (item as any).simulacao_id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    const criterios = ((item as any).cenario_snapshot?.criterios ?? []) as Criterio[];
    const { resultado, avaliados } = avaliarCenario(criterios, {
      respostasNina,
      ferramentas,
      transferida,
      houveErro,
      turnos: (sim as any)?.turnos ?? 0,
    });

    const agora = new Date().toISOString();
    await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .update({
        status: data.erroCliente ? "erro" : "concluido",
        resultado,
        criterios_resultado: avaliados,
        mensagens,
        turnos: (sim as any)?.turnos ?? 0,
        input_tokens: inputTokens + ((sim as any)?.input_tokens ?? 0),
        output_tokens: outputTokens + ((sim as any)?.output_tokens ?? 0),
        modelo_nina: modeloNina,
        prompt_versao: promptVersao,
        prompt_versao_id: promptVersaoId,
        ferramentas,
        transferida,
        conversa_id: conversaId,
        ciclo_id: (lead as any)?.ciclo_id ?? null,
        erro: data.erroCliente ?? null,
        finalizado_em: agora,
      })
      .eq("id", (item as any).id);

    // Atualiza os totais da execução e fecha quando não sobra item pendente.
    const { data: irmaos } = await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .select("status, resultado")
      .eq("clinica_id", data.clinicaId)
      .eq("execucao_id", (item as any).execucao_id);
    const linhas = (irmaos ?? []) as any[];
    const pendentes = linhas.filter((l) => l.status === "pendente" || l.status === "executando");
    await supabaseAdmin
      .from("nina_teste_execucoes")
      .update({
        aprovados: linhas.filter((l) => l.resultado === "aprovado").length,
        reprovados: linhas.filter((l) => l.resultado === "reprovado").length,
        inconclusivos: linhas.filter((l) => l.resultado === "inconclusivo").length,
        ...(pendentes.length ? {} : { status: "concluida", finalizado_em: agora }),
      })
      .eq("id", (item as any).execucao_id);

    return { resultado, avaliados, mensagens, ferramentas, transferida };
  });

/** Interrompe uma execução em lote e cancela os itens que ainda não rodaram. */
export const pararExecucaoCenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), execucaoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const agora = new Date().toISOString();
    await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .update({ status: "cancelado", finalizado_em: agora })
      .eq("clinica_id", data.clinicaId)
      .eq("execucao_id", data.execucaoId)
      .in("status", ["pendente", "executando"]);
    await supabaseAdmin
      .from("nina_teste_execucoes")
      .update({ status: "parada", finalizado_em: agora })
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.execucaoId);
    return { ok: true };
  });

/** Execuções recentes da clínica. */
export const listarExecucoesCenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { data: linhas, error } = await context.supabase
      .from("nina_teste_execucoes")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { execucoes: linhas ?? [] };
  });

/** Detalhe de uma execução com todos os itens (para auditoria). */
export const detalheExecucaoCenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), execucaoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: Ctx }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { data: execucao } = await context.supabase
      .from("nina_teste_execucoes")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("id", data.execucaoId)
      .maybeSingle();
    if (!execucao) throw new Error("Execução não encontrada nesta clínica");
    const { data: itens } = await context.supabase
      .from("nina_teste_execucao_itens")
      .select("*")
      .eq("clinica_id", data.clinicaId)
      .eq("execucao_id", data.execucaoId)
      .order("ordem", { ascending: true });
    return { execucao, itens: itens ?? [] };
  });
