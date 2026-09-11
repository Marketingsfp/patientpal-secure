/**
 * Console de testes da Nina (homologação).
 *
 * Reaproveita EXATAMENTE o mesmo pipeline do WhatsApp (`gerarRespostaNina`:
 * mesmo modelo, prompt, ferramentas e contexto da clínica). A única diferença
 * é o canal: nada é enviado à Meta, nenhum webhook externo é acionado.
 *
 * Isolamento de memória: cada lead tem um telefone virtual por SESSÃO
 * (`55 00 <lead> <sessão>`). Ao resolver a conversa, o contador de sessão sobe
 * e o telefone muda — como todo o histórico/identidade da Nina é buscado por
 * telefone + conversa, a próxima conversa nasce sem nenhuma memória anterior.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  CANAL_TESTE,
  LIMITE_MENSAGENS_LEAD,
  TOTAL_LEADS,
  telefoneSessao,
  garantirLeads,
  carregarLead,
  garantirCiclo,
  conversasDoLead,
  podarMensagensLead,
  processarMensagemTeste,
  type LeadRow,
} from "@/lib/nina/teste-console.server";
import { resumirLeads, previaTexto, type MensagemResumoRow } from "@/lib/nina/leads-resumo";


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


export const listarLeadsTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const leads = await garantirLeads(supabaseAdmin, data.clinicaId);

    const ids = leads.map((l) => l.conversa_id).filter(Boolean) as string[];

    /**
     * FASE 4 — resumo da inbox de homologação em UMA consulta agrupada.
     *
     * A função `nina_teste_resumo_leads` devolve, para todas as conversas de
     * teste de uma vez: total de mensagens, não lidas DESTE usuário e a última
     * mensagem conversacional (eventos técnicos ficam de fora). Nada de uma
     * consulta por card.
     */
    type ResumoRpc = {
      total_mensagens: number | null;
      nao_lidas: number | null;
      ultima_msg_id: string | null;
      ultima_msg_body: string | null;
      ultima_msg_autor: "paciente" | "nina" | "atendente" | null;
      ultima_msg_em: string | null;
      ultima_atividade_em: string | null;
    };
    const porConversa = new Map<string, ResumoRpc>();
    let rpcOk = false;
    if (ids.length) {
      try {
        const { data: rows, error } = await context.supabase.rpc(
          "nina_teste_resumo_leads" as never,
          { _clinica_id: data.clinicaId, _conversa_ids: ids } as never,
        );
        if (error) throw new Error(error.message);
        for (const r of ((rows ?? []) as any[])) porConversa.set(r.conversa_id, r as ResumoRpc);
        rpcOk = porConversa.size > 0;
      } catch (e) {
        console.error("[homologacao] resumo agrupado falhou, usando amostra", e);
      }
    }

    // Plano B (só se o resumo agrupado falhar): amostra recente das conversas
    // atuais — nunca o histórico completo de cada lead.
    const conversasPorLead: Record<string, string[]> = {};
    for (const l of leads) conversasPorLead[l.id] = l.conversa_id ? [l.conversa_id] : [];
    let resumos = resumirLeads(conversasPorLead, [], {});
    if (!rpcOk && ids.length) {
      const AMOSTRA_POR_LEAD = 20;
      const { data: msgs } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .select("id, conversa_id, direction, body, tipo, enviada_por, created_at, read_at")
        .eq("clinica_id", data.clinicaId)
        .in("conversa_id", ids)
        .order("created_at", { ascending: false })
        .limit(ids.length * AMOSTRA_POR_LEAD);
      const lidoAte: Record<string, string | null> = {};
      const { data: leituras } = await context.supabase
        .from("atend_leituras")
        .select("conversa_id, ultima_msg_lida_em")
        .eq("clinica_id", data.clinicaId)
        .in("conversa_id", ids);
      for (const l of (leituras ?? []) as any[])
        lidoAte[l.conversa_id] = l.ultima_msg_lida_em ?? null;
      resumos = resumirLeads(conversasPorLead, (msgs ?? []) as MensagemResumoRow[], lidoAte);
    }

    return {
      leads: leads.map((l) => {
        const r = resumos[l.id]!;
        const g = l.conversa_id ? porConversa.get(l.conversa_id) : undefined;
        const ultimaEm = g ? g.ultima_msg_em : r.lastMessageAt;
        return {
          id: l.id,
          indice: l.indice,
          nome: l.nome,
          telefone: l.telefone_sessao,
          sessao: l.sessao_seq,
          conversaId: l.conversa_id,
          cicloId: l.ciclo_id,
          cicloIniciadoEm: l.ciclo_iniciado_em,
          resolvidoEm: l.resolvido_em,
          status: l.status,
          mensagens: g ? Number(g.total_mensagens ?? 0) : r.totalMensagens,
          ultimaMensagemId: g ? g.ultima_msg_id : r.lastMessageId,
          ultimaMensagemTexto: g
            ? (g.ultima_msg_body ? previaTexto(g.ultima_msg_body) : null)
            : r.lastMessageText,
          ultimaMensagemAutor: g ? g.ultima_msg_autor : r.lastMessageAuthor,
          ultimaMensagemEm: ultimaEm,
          // Fonte estável de ordenação por atividade recente: só conversa,
          // evento técnico não reposiciona o card.
          ultimaAtividadeEm: g ? (g.ultima_atividade_em ?? ultimaEm) : ultimaEm,
          naoLidas: g ? Number(g.nao_lidas ?? 0) : r.unreadCount,
        };
      }),
    };


  });

/**
 * FASE 3 — registra a leitura INDIVIDUAL do usuário em um lead de teste.
 *
 * Só é chamada quando o testador realmente abre o lead e as mensagens são
 * exibidas — nunca por prefetch, hover, cache ou carga em segundo plano.
 * Usa a mesma tabela de leitura individual do atendimento (`atend_leituras`)
 * pela sessão do próprio usuário, então a leitura de um testador não zera o
 * contador de outro e os pacientes reais não são afetados.
 */
export const marcarLeadTesteLido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        conversaId: z.string().uuid(),
        mensagemId: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { error } = await context.supabase.rpc("atend_registrar_leitura", {
      _clinica_id: data.clinicaId,
      _conversa_id: data.conversaId,
      _mensagem_id: data.mensagemId ?? undefined,
    } as never);
    if (error) throw new Error(error.message);
    const { data: cont } = await context.supabase.rpc("nina_teste_nao_lidas" as never, {
      _clinica_id: data.clinicaId,
      _conversa_ids: [data.conversaId],
    } as never);
    const linha = ((cont ?? []) as any[])[0];
    return { ok: true, naoLidas: Number(linha?.nao_lidas ?? 0) || 0 };
  });


export const historicoLeadTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lead = await carregarLead(supabaseAdmin, data.clinicaId, data.leadId);

    // O console mostra TODAS as sessões do lead (histórico visual completo).
    // A memória da Nina continua isolada: ela só enxerga o telefone da sessão atual.
    const ids = await conversasDoLead(supabaseAdmin, data.clinicaId, lead);
    if (ids.length === 0)
      return { mensagens: [], conversaId: lead.conversa_id, sessao: lead.sessao_seq };


    // Busca as mensagens MAIS RECENTES (desc) e reordena para exibição: com
    // muitas sessões o lead passa do limite, e ordenar asc esconderia justo as
    // mensagens novas enviadas depois do reset.
    const { data: msgsDesc, error } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id, conversa_id, direction, body, enviada_por, created_at, execucao_id")
      .eq("clinica_id", data.clinicaId)
      .in("conversa_id", ids)
      .order("created_at", { ascending: false })
      .limit(LIMITE_MENSAGENS_LEAD);
    if (error) throw new Error(error.message);
    const msgs = ((msgsDesc ?? []) as any[]).slice().reverse();


    // Eventos operacionais (resolvida, memória resetada, atribuição…). O
    // console mescla com as mensagens por `created_at` — nada de popup.
    const { data: evs } = await supabaseAdmin
      .from("atend_conversa_eventos")
      .select("id, evento, user_id, motivo, detalhes, created_at")
      .eq("clinica_id", data.clinicaId)
      .in("conversa_id", ids)
      .order("created_at", { ascending: false })
      .limit(200);
    const lista = ((evs ?? []) as any[]).slice().reverse();

    const userIds = Array.from(
      new Set(lista.map((e) => e.user_id).filter((v): v is string => !!v)),
    );
    const nomes = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);
      for (const p of (profs ?? []) as any[]) if (p.nome) nomes.set(p.id, p.nome);
    }

    return {
      conversaId: lead.conversa_id,
      sessao: lead.sessao_seq,
      mensagens: (msgs ?? []) as any[],
      eventos: lista.map((e) => ({
        ...e,
        user_nome: e.user_id ? (nomes.get(e.user_id) ?? null) : null,
      })),
    };
  });


export const enviarMensagemTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid(),
        // Espelha os tipos que chegam pelo webhook da Meta.
        tipo: z.enum(["text", "audio", "image", "document", "sticker"]).default("text"),
        // Em áudio, o texto é a "transcrição": vazio simula transcrição falha.
        texto: z.string().trim().max(2000).default(""),
        chave: z.string().min(6).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    // Mesmo núcleo usado pelo simulador e pelo teste de carga.
    return await processarMensagemTeste(data, context.userId);
  });


/**
 * Painel técnico da homologação: quais ferramentas a Nina chamou nesta
 * conversa, com argumentos e resposta do backend. Lê o rastro do `audit_log`
 * (ação NINA_TOOL) — nada de novo é gravado só para o painel.
 */
export const ferramentasUsadasTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), conversaId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linhas } = await supabaseAdmin
      .from("audit_log")
      .select("id, created_at, dados_depois")
      .eq("clinica_id", data.clinicaId)
      .eq("action", "NINA_TOOL")
      .order("created_at", { ascending: false })
      .limit(200);

    const eventos = ((linhas ?? []) as any[])
      .filter((l) => l?.dados_depois?.conversa_id === data.conversaId)
      .map((l) => {
        const d = l.dados_depois ?? {};
        const entrada = d.entrada ?? {};
        return {
          id: l.id as string,
          em: l.created_at as string,
          ferramenta: String(entrada.ferramenta ?? d.ferramenta ?? "?"),
          argumentos: entrada.argumentos ?? null,
          ms: Number(entrada.ms ?? 0),
          ok: Boolean(d.ok),
          erro: (d.erro as string | null) ?? null,
          resposta: entrada.resposta ?? null,
        };
      })
      .reverse();

    // Estado estruturado atual do fluxo — só visível na homologação, nunca
    // para o paciente. É o que permite depurar "por que ela perguntou isso".
    const { carregarFluxoEstado } = await import("@/lib/nina/fluxo-estado.server");
    const estado = await carregarFluxoEstado(
      supabaseAdmin as never,
      data.clinicaId,
      data.conversaId,
    );
    const ultima = eventos[eventos.length - 1] ?? null;
    const debug = {
      patient_id: estado.patient.id,
      patient_identified: estado.patient.identified,
      patient_validated: estado.patient.validated,
      patient_first_name: estado.patient.first_name,
      doctor_id: estado.appointment.doctor_id,
      doctor_name: estado.appointment.doctor_name,
      specialty: estado.appointment.specialty,
      procedure: estado.appointment.procedure,
      selected_date: estado.appointment.date,
      selected_time: estado.appointment.time,
      slot_inicio: estado.appointment.slot_inicio,
      slot_fim: estado.appointment.slot_fim,
      slot_confirmed_by_patient: estado.appointment.slot_confirmed_by_patient,
      appointment_id: estado.appointment.appointment_id,
      current_flow_stage: estado.flow.stage,
      // Sessão da Nina (QA): permite ver por que a apresentação ocorreu ou não.
      nina_session_id: estado.session_id ?? null,
      new_session: !estado.session_id,
      greeting_required: estado.greeting_completed !== true,
      greeting_completed: estado.greeting_completed === true,
      conversation_state: estado.flow.stage,
      tool_called: ultima?.ferramenta ?? null,
      tool_result: ultima ? (ultima.ok ? "ok" : (ultima.erro ?? "erro")) : null,
      updated_at: estado.updated_at,
    };

    // Fase 5 — telemetria da última execução do modelo NESTA conversa.
    // Só aparece na homologação; nunca é enviada ao paciente.
    const { data: exec } = await supabaseAdmin
      .from("nina_execucoes")
      .select("model,thinking_level,route_reason,knowledge_status,tool_calls,latency_ms,input_tokens,output_tokens,retries,success,error_category,handoff")
      .eq("conversation_id", data.conversaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const observabilidade = exec
      ? {
          model: exec.model,
          reasoning: String(exec.thinking_level ?? "").toUpperCase(),
          route_reason: exec.route_reason,
          knowledge: exec.knowledge_status ? String(exec.knowledge_status).toUpperCase() : "—",
          tools: (exec.tool_calls ?? []).join(", ") || "—",
          latency_ms: exec.latency_ms,
          input_tokens: exec.input_tokens,
          output_tokens: exec.output_tokens,
          retries: exec.retries,
          success: exec.success,
          error_category: exec.error_category,
          handoff: exec.handoff,
        }
      : null;

    return { eventos, debug: { ...debug, ...(observabilidade ?? {}) } };
  });

export const resolverConversaTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid(),
        conversaId: z.string().uuid(),
        /** Remove da agenda os agendamentos criados nesta sessão de teste. */
        removerAgendamentos: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resetarLeadTeste } = await import("@/lib/nina/teste-console.server");
    // Rotina canônica única de reset (mesma usada pelo preflight do teste de carga).
    return await resetarLeadTeste(supabaseAdmin, {
      clinicaId: data.clinicaId,
      leadId: data.leadId,
      conversaId: data.conversaId,
      userId: context.userId,
      removerAgendamentos: data.removerAgendamentos,
      origem: "console_teste",
    });
  });


/**
 * FASE 3 — detalhe técnico de UMA mensagem da Nina na homologação.
 * Mostra prompt/versão, conhecimento, ferramentas, modelo, erros e resposta,
 * exatamente como registrado pelo mesmo núcleo usado no WhatsApp real.
 */
export const detalheExecucaoTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clinicaId: z.string().uuid(), execucaoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: exec } = await supabaseAdmin
      .from("nina_execucoes")
      .select(
        "id, created_at, model, thinking_level, latency_ms, knowledge_status, tool_calls, success, error_category, handoff, input_tokens, output_tokens, retries, prompt_versao, prompt_origem, prompt_publicado_em, prompt_modulos",
      )
      .eq("id", data.execucaoId)
      .eq("clinica_id", data.clinicaId)
      .maybeSingle();
    if (!exec) return { execucao: null, etapas: [], traceId: null as string | null, eventos: [] };

    const { data: evid } = await supabaseAdmin
      .from("nina_execucao_evidencias")
      .select("etapas")
      .eq("execucao_id", data.execucaoId)
      .maybeSingle();

    const { data: eventos } = await supabaseAdmin
      .from("nina_trace_eventos")
      .select(
        "trace_id, execution_id, conversation_id, message_id, node_id, event_type, status, duration_ms, started_at, metadata",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("execution_id", data.execucaoId)
      .order("started_at", { ascending: true })
      .limit(200);

    let lista = (eventos ?? []) as any[];
    // O trace cobre a mensagem inteira (várias rodadas de modelo). Buscando
    // pelo trace_id trazemos TODAS as etapas, não só as da última rodada.
    const traceId = (lista[0]?.trace_id as string | undefined) ?? null;
    if (traceId) {
      const { data: todos } = await supabaseAdmin
        .from("nina_trace_eventos")
        .select(
          "trace_id, execution_id, conversation_id, message_id, node_id, event_type, status, duration_ms, started_at, metadata",
        )
        .eq("clinica_id", data.clinicaId)
        .eq("trace_id", traceId)
        .order("started_at", { ascending: true })
        .limit(300);
      if (todos?.length) lista = todos as any[];
    }
    return {
      execucao: exec as any,
      etapas: ((evid as any)?.etapas ?? []) as any[],
      traceId,
      eventos: lista,
    };
  });

/**
 * FASE 5 — DIAGNÓSTICO DOS CICLOS DE UM LEAD DE TESTE.
 *
 * Leitura de auditoria (QA): lista os ciclos do lead com `cycle_id`,
 * `nina_session_id`, situação, motivo de encerramento, início, fim e o
 * instante em que a memória ativa foi invalidada. Não altera nada e não
 * apaga histórico — só prova que o reset aconteceu.
 */
export const diagnosticoCiclosLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid(),
        limite: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { diagnosticoCiclos, ciclosSemProvaDeReset } = await import("@/lib/nina/ciclo-teste");

    const { data: linhas, error } = await supabaseAdmin
      .from("nina_teste_ciclos")
      .select(
        "id, lead_id, status, sessao_seq, conversa_id, nina_session_id, started_at, ended_at, end_reason, memory_reset_at, created_at",
      )
      .eq("clinica_id", data.clinicaId)
      .eq("lead_id", data.leadId)
      .order("started_at", { ascending: false })
      .limit(data.limite ?? 30);
    if (error) throw new Error(error.message);

    const ciclos = diagnosticoCiclos((linhas ?? []) as any[]);
    return {
      ciclos: ciclos.slice().reverse(),
      totalCiclos: ciclos.length,
      semProvaDeReset: ciclosSemProvaDeReset(ciclos).length,
    };
  });
