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
import { criteriosDeHandoff, verificarHandoff } from "./handoff-assertions";
import {
  aplicarRegraHandoff,
  desfechoDoItem,
  handoffEsperado,
  MOTIVO_CICLO_POR_DESFECHO,
  type DesfechoCenario,
} from "@/lib/nina/cenario-desfecho";
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
  handoffEsperado: z.boolean().nullish(),
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
      handoff_esperado: data.handoffEsperado ?? null,
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
      handoff_esperado: handoffEsperado(d.cenario as any),
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
      const { patchEncerrarCiclo } = await import("@/lib/nina/ciclo-teste");
      await supabaseAdmin
        .from("nina_teste_ciclos")
        .update({
          ...patchEncerrarCiclo("cenario_concluido", agora),
          resolvido_por: context.userId,
        } as never)
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
        handoffCliente: z.boolean().nullish(),
        interrompido: z.boolean().nullish(),
        turnosUsados: z.number().int().min(0).max(100).nullish(),
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
      .select("id, indice, sessao_seq, conversa_id, ciclo_id")
      .eq("clinica_id", data.clinicaId)
      .eq("id", (item as any).lead_id)
      .maybeSingle();

    // O handoff (Fase 2) já pode ter encerrado o ciclo e limpado os ponteiros do
    // lead. Nesse caso recuperamos a conversa pelo ciclo aberto para este item —
    // nunca pela "primeira conversa do lead".
    let conversaId = (lead as any)?.conversa_id ?? null;
    let cicloId = (lead as any)?.ciclo_id ?? null;
    if (!conversaId && (item as any).iniciado_em) {
      const { data: ciclo } = await supabaseAdmin
        .from("nina_teste_ciclos")
        .select("id, conversa_id")
        .eq("clinica_id", data.clinicaId)
        .eq("lead_id", (item as any).lead_id)
        .gte("started_at", (item as any).iniciado_em)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      conversaId = (ciclo as any)?.conversa_id ?? null;
      cicloId = (ciclo as any)?.id ?? cicloId;
    }



    let respostasNina: string[] = [];
    let mensagens = 0;
    // FASE 8 — a verificação parte das SAÍDAS reais, não dos snapshots.
    let saidasEsperadas: Array<{
      id: string;
      execucao_id: string | null;
      texto_hash: string | null;
    }> = [];
    if (conversaId) {
      const { data: msgs } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .select("id, direction, body, enviada_por, execucao_id")
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", conversaId)
        .order("created_at", { ascending: true });
      const lista = ((msgs ?? []) as any[]).filter((m) => (m.body ?? "").trim());
      mensagens = lista.length;
      const saidas = lista.filter((m) => m.direction === "out");
      respostasNina = saidas.map((m) => String(m.body));
      const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
      saidasEsperadas = saidas.map((m) => ({
        id: String(m.id),
        execucao_id: m.execucao_id ?? null,
        texto_hash: hashDoTexto(String(m.body)),
      }));
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

    if (data.handoffCliente) transferida = true;

    const criterios = ((item as any).cenario_snapshot?.criterios ?? []) as Criterio[];
    const base = avaliarCenario(criterios, {
      respostasNina,
      ferramentas,
      transferida,
      houveErro,
      turnos: (sim as any)?.turnos ?? 0,
    });

    // Handoff é o fim do ciclo automatizado. PASS/FAIL depende do esperado.
    const esperado =
      typeof (item as any).handoff_esperado === "boolean"
        ? ((item as any).handoff_esperado as boolean)
        : handoffEsperado((item as any).cenario_snapshot ?? {});
    const desfecho: DesfechoCenario = desfechoDoItem({
      transferida,
      erro: data.erroCliente ?? null,
      interrompido: !!data.interrompido,
      turnosUsados: data.turnosUsados ?? (sim as any)?.turnos ?? 0,
      maxTurnos: Number((item as any).cenario_snapshot?.max_turnos ?? 0),
    });
    let { resultado, avaliados } = aplicarRegraHandoff(base, { desfecho, esperado });

    // FASE 5 — assertions determinísticas de handoff (verificadas pelo sistema,
    // nunca pelo avaliador de IA). Só se aplicam quando o cenário espera handoff.
    let verificacaoHandoff: ReturnType<typeof verificarHandoff> | null = null;
    if (esperado === true && conversaId) {
      const { data: convFim } = await supabaseAdmin
        .from("atend_conversas")
        .select("protocolo_atendimento, departamento_id")
        .eq("clinica_id", data.clinicaId)
        .eq("id", conversaId)
        .maybeSingle();
      const protocolo = (convFim as any)?.protocolo_atendimento ?? null;

      const { data: eventos } = await supabaseAdmin
        .from("atend_conversa_eventos")
        .select("detalhes")
        .eq("clinica_id", data.clinicaId)
        .eq("conversa_id", conversaId);
      const numeros = new Set<string>();
      for (const e of (eventos ?? []) as any[]) {
        const n = e?.detalhes?.protocol_number;
        if (typeof n === "string" && n.trim()) numeros.add(n.trim());
      }
      if (protocolo) numeros.add(String(protocolo).trim());

      let cicloStatus: string | null = null;
      let cicloEndReason: string | null = null;
      let memoryResetAt: string | null = null;
      if (cicloId) {
        const { data: c } = await supabaseAdmin
          .from("nina_teste_ciclos")
          .select("status, end_reason, memory_reset_at")
          .eq("clinica_id", data.clinicaId)
          .eq("id", cicloId)
          .maybeSingle();
        cicloStatus = (c as any)?.status ?? null;
        cicloEndReason = (c as any)?.end_reason ?? null;
        memoryResetAt = (c as any)?.memory_reset_at ?? null;
      }

      verificacaoHandoff = verificarHandoff({
        transferida,
        protocolo,
        protocolosDistintos: numeros.size,
        mensagensSaida: respostasNina,
        cicloStatus,
        cicloEndReason,
        memoryResetAt,
      });
      avaliados = [...avaliados, ...criteriosDeHandoff(verificacaoHandoff)];
      if (resultado !== "inconclusivo") {
        resultado = avaliados.every((a) => a.ok) ? "aprovado" : "reprovado";
      }
    }

    // FASE 8 — confiança declarada pela Nina durante o cenário. Lemos os
    // snapshots REAIS já persistidos pelo Confidence Decision Engine; nada é
    // recalculado aqui. Os critérios rodam SEMPRE que houve saída da Nina:
    // ausência de avaliação reprova o cenário em vez de pular a verificação.
    const { resumirConfiancaExecucao } = await import("@/lib/nina/confianca-execucao");
    let resumoConfianca = resumirConfiancaExecucao([]);
    if (conversaId) {
      const { data: snaps } = await supabaseAdmin
        .from("nina_confianca_decisoes")
        .select(
          "score, nivel, trace_id, message_id, policy_version, evidence_coverage, bloqueadores, outgoing_message_id, clinica_id, conversation_id, execucao_id, avaliacao, texto_final_hash",
        )
        .eq("clinica_id", data.clinicaId)
        .eq("conversation_id", conversaId)
        .order("created_at", { ascending: true });
      resumoConfianca = resumirConfiancaExecucao((snaps ?? []) as any[]);

      if (saidasEsperadas.length > 0 || (snaps ?? []).length > 0) {
        const { verificarConfiancaRunner, criteriosDeConfianca } = await import(
          "@/lib/nina/confidence/gate-v2"
        );
        const criteriosConfianca = criteriosDeConfianca(
          verificarConfiancaRunner((snaps ?? []) as any[], saidasEsperadas, {
            clinicaId: data.clinicaId,
            conversaId,
          }),
        );
        avaliados = [...avaliados, ...(criteriosConfianca as any[])];
        if (resultado !== "inconclusivo") {
          resultado = avaliados.every((a) => a.ok) ? "aprovado" : "reprovado";
        }
      }
    }


    const agora = new Date().toISOString();
    await supabaseAdmin
      .from("nina_teste_execucao_itens")
      .update({
        status: data.erroCliente ? "erro" : "concluido",
        resultado,
        criterios_resultado: avaliados,
        desfecho,
        handoff_esperado: esperado,
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
        ciclo_id: cicloId,
        confianca_amostras: resumoConfianca.amostras,
        confianca_media: resumoConfianca.media,
        confianca_min: resumoConfianca.min,
        confianca_max: resumoConfianca.max,
        confianca_niveis: resumoConfianca.niveis,
        confianca_nivel_minimo: resumoConfianca.nivelMinimo,
        confianca_trace_ids: resumoConfianca.traceIds,
        erro: data.erroCliente ?? null,
        finalizado_em: agora,
      } as never)
      .eq("id", (item as any).id);

    // Cleanup do ciclo deste lead: encerra (histórico preservado) e libera o
    // lead para o próximo cenário, sem tocar em nenhum outro lead.
    if (lead) {
      const { patchEncerrarCiclo } = await import("@/lib/nina/ciclo-teste");
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
      if (cicloId) {
        await supabaseAdmin
          .from("nina_teste_ciclos")
          .update({
            ...patchEncerrarCiclo(MOTIVO_CICLO_POR_DESFECHO[desfecho], agora),
            resolvido_por: context.userId,
          } as never)
          .eq("clinica_id", data.clinicaId)
          .eq("id", cicloId)
          .eq("status", "ativo");
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
        .eq("clinica_id", data.clinicaId)
        .eq("id", (lead as any).id);

      // Nenhuma simulação de paciente pode continuar viva após o cenário.
      await supabaseAdmin
        .from("nina_teste_simulacoes")
        .update({ status: "parada", finalizado_em: agora, motivo_fim: desfecho === "handoff" ? "transferencia" : "operador" })
        .eq("clinica_id", data.clinicaId)
        .eq("lead_id", (lead as any).id)
        .in("status", ["executando", "pausada"]);
    }


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
