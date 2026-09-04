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

const CANAL_TESTE = "test-console";
const TOTAL_LEADS = 10;

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

/** DDD "00" nunca existe no Brasil: o telefone virtual não colide com paciente real. */
function telefoneSessao(indice: number, sessao: number) {
  return `5500${String(indice).padStart(2, "0")}${String(sessao).padStart(5, "0")}`;
}

type LeadRow = {
  id: string;
  indice: number;
  nome: string;
  telefone_base: string;
  telefone_sessao: string;
  sessao_seq: number;
  conversa_id: string | null;
  status: string;
};

/** Cria os 10 leads da clínica se ainda não existirem (idempotente). */
async function garantirLeads(admin: any, clinicaId: string): Promise<LeadRow[]> {
  const linhas = Array.from({ length: TOTAL_LEADS }, (_, i) => {
    const indice = i + 1;
    return {
      clinica_id: clinicaId,
      indice,
      nome: `Lead Teste ${String(indice).padStart(2, "0")}`,
      telefone_base: telefoneSessao(indice, 0),
      telefone_sessao: telefoneSessao(indice, 1),
      sessao_seq: 1,
      status: "ativa",
    };
  });
  const { error } = await admin
    .from("nina_teste_leads")
    .upsert(linhas, { onConflict: "clinica_id,indice", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  const { data, error: e2 } = await admin
    .from("nina_teste_leads")
    .select("id, indice, nome, telefone_base, telefone_sessao, sessao_seq, conversa_id, status")
    .eq("clinica_id", clinicaId)
    .order("indice");
  if (e2) throw new Error(e2.message);
  return (data ?? []) as LeadRow[];
}

async function carregarLead(admin: any, clinicaId: string, leadId: string): Promise<LeadRow> {
  const { data, error } = await admin
    .from("nina_teste_leads")
    .select("id, indice, nome, telefone_base, telefone_sessao, sessao_seq, conversa_id, status")
    .eq("clinica_id", clinicaId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead de teste não encontrado nesta clínica");
  return data as LeadRow;
}

/** Garante a conversa da sessão atual do lead (canal test-console, marcada como teste). */
async function garantirConversa(admin: any, clinicaId: string, lead: LeadRow): Promise<string> {
  if (lead.conversa_id) return lead.conversa_id;
  const { data, error } = await admin
    .from("atend_conversas")
    .insert({
      clinica_id: clinicaId,
      canal: CANAL_TESTE,
      contato_telefone: lead.telefone_sessao,
      contato_nome: lead.nome,
      status: "bot_attending",
      owner_type: "AI",
      ai_enabled: true,
      is_teste: true,
      ultima_msg_em: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const conversaId = (data as any)?.id as string;
  await admin
    .from("nina_teste_leads")
    .update({ conversa_id: conversaId, status: "ativa" })
    .eq("id", lead.id);
  return conversaId;
}

export const listarLeadsTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMembership(context.supabase, context.userId, data.clinicaId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const leads = await garantirLeads(supabaseAdmin, data.clinicaId);

    const ids = leads.map((l) => l.conversa_id).filter(Boolean) as string[];
    const contagem = new Map<string, number>();
    if (ids.length) {
      const { data: msgs } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .select("conversa_id")
        .eq("clinica_id", data.clinicaId)
        .in("conversa_id", ids);
      for (const m of (msgs ?? []) as any[])
        contagem.set(m.conversa_id, (contagem.get(m.conversa_id) ?? 0) + 1);
    }

    return {
      leads: leads.map((l) => ({
        id: l.id,
        indice: l.indice,
        nome: l.nome,
        telefone: l.telefone_sessao,
        sessao: l.sessao_seq,
        conversaId: l.conversa_id,
        status: l.status,
        mensagens: l.conversa_id ? (contagem.get(l.conversa_id) ?? 0) : 0,
      })),
    };
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
    const { data: convs } = await supabaseAdmin
      .from("atend_conversas")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .eq("is_teste", true)
      .like("contato_telefone", `5500${String(lead.indice).padStart(2, "0")}%`);
    const ids = ((convs ?? []) as any[]).map((c) => c.id as string);
    if (lead.conversa_id && !ids.includes(lead.conversa_id)) ids.push(lead.conversa_id);
    if (ids.length === 0)
      return { mensagens: [], conversaId: lead.conversa_id, sessao: lead.sessao_seq };

    // Busca as mensagens MAIS RECENTES (desc) e reordena para exibição: com
    // muitas sessões o lead passa do limite, e ordenar asc esconderia justo as
    // mensagens novas enviadas depois do reset.
    const { data: msgsDesc, error } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id, direction, body, enviada_por, created_at")
      .eq("clinica_id", data.clinicaId)
      .in("conversa_id", ids)
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    const msgs = ((msgsDesc ?? []) as any[]).slice().reverse();


    // Eventos operacionais (resolvida, memória resetada, atribuição…). O
    // console mescla com as mensagens por `created_at` — nada de popup.
    const { data: evs } = await supabaseAdmin
      .from("atend_conversa_eventos")
      .select("id, evento, user_id, motivo, detalhes, created_at")
      .eq("clinica_id", data.clinicaId)
      .in("conversa_id", ids)
      .order("created_at", { ascending: true })
      .limit(200);
    const lista = (evs ?? []) as any[];
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lead = await carregarLead(supabaseAdmin, data.clinicaId, data.leadId);
    const conversaId = await garantirConversa(supabaseAdmin, data.clinicaId, lead);

    const ehAudio = data.tipo === "audio";
    const textoPaciente = data.tipo === "text" || ehAudio ? data.texto : "";
    const audioFalhou = ehAudio && !textoPaciente;
    if (data.tipo === "text" && !textoPaciente) {
      return { duplicada: false, reply: null as string | null, erro: "Mensagem vazia.", audio: null };
    }

    // Mesmo corpo gravado pelo webhook real (áudio recebe o prefixo 🎤).
    const body = ehAudio
      ? textoPaciente
        ? `🎤 ${textoPaciente}`
        : "🎤 [áudio não transcrito]"
      : data.tipo === "text"
        ? textoPaciente
        : `[${data.tipo}]`;

    // Anti-duplo-clique: a mesma chave nunca entra duas vezes.
    const waId = `test-${lead.id}-${data.chave}`;
    const { data: jaExiste } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id")
      .eq("clinica_id", data.clinicaId)
      .eq("wa_message_id", waId)
      .maybeSingle();
    if (jaExiste) return { duplicada: true, reply: null as string | null, erro: null, audio: null };

    const agora = new Date().toISOString();
    await supabaseAdmin.from("whatsapp_mensagens").insert({
      clinica_id: data.clinicaId,
      conversa_id: conversaId,
      canal: CANAL_TESTE,
      wa_message_id: waId,
      direction: "in",
      from_number: lead.telefone_sessao,
      to_number: CANAL_TESTE,
      body,
      tipo: data.tipo,
      transcricao: ehAudio && textoPaciente ? textoPaciente : null,
      status: "received",
      enviada_por: "paciente",
      is_teste: true,
    });
    await supabaseAdmin
      .from("atend_conversas")
      .update({ ultima_msg_em: agora, ultima_msg_preview: body.slice(0, 160) })
      .eq("id", conversaId);

    // Nina desligada na clínica → mesmo comportamento do WhatsApp: não responde.
    const { ninaDesativadaNaClinica } = await import("@/lib/nina-desligada.server");
    if (await ninaDesativadaNaClinica(data.clinicaId)) {
      return {
        duplicada: false,
        reply: null,
        erro: "A Nina está desativada nesta clínica.",
        audio: null,
      };
    }

    // Atendimento híbrido: se a conversa já está com uma pessoa (ou na fila),
    // a Nina cala — exatamente como no WhatsApp.
    const { estadoConversaPorId, ninaPodeResponder } = await import(
      "@/lib/atendimento/handoff.server"
    );
    const estadoAntes = await estadoConversaPorId(data.clinicaId, conversaId);
    if (!ninaPodeResponder(estadoAntes)) {
      return {
        duplicada: false,
        reply: null,
        erro: "Conversa está com atendimento humano — a Nina não responde (igual ao WhatsApp).",
        audio: null,
      };
    }

    const { RESPOSTA_AUDIO_FALHOU, respostaMidiaNaoSuportada } = await import(
      "@/lib/whatsapp-midia.server"
    );

    // Diagnóstico da homologação: uma linha por mensagem processada, com o
    // estado de cada etapa. Nunca aparece para o paciente.
    const t0 = Date.now();
    const diag = {
      conversation_id: conversaId,
      message_wa_id: waId,
      message_received_at: agora,
      conversation_status: estadoAntes?.status ?? null,
      assigned_to: estadoAntes?.owner_type ?? null,
      processing_status: "processing" as "processing" | "completed" | "failed",
      model_called: false,
      response_saved: false,
      duration_ms: 0,
      error_code: null as string | null,
      error_message: null as string | null,
    };

    let reply = "";
    let falhaTecnica = false;
    try {
      if (textoPaciente) {
        const { gerarRespostaNina } = await import("@/lib/whatsapp.server");
        diag.model_called = true;
        reply = await gerarRespostaNina(data.clinicaId, textoPaciente, lead.telefone_sessao, {
          teste: true,
        });
      } else if (audioFalhou) {
        reply = RESPOSTA_AUDIO_FALHOU;
      } else {
        reply = respostaMidiaNaoSuportada(data.tipo);
      }
    } catch (e) {
      // Falha técnica real: a mensagem NÃO pode ficar sem desfecho. Gravamos
      // um retorno seguro na própria conversa e registramos o erro.
      falhaTecnica = true;
      diag.processing_status = "failed";
      diag.error_code = "NINA_PIPELINE_ERROR";
      diag.error_message = String((e as Error)?.message ?? e).slice(0, 300);
      console.error("[NINA_MESSAGE_PROCESSING]", { ...diag, duration_ms: Date.now() - t0 });
      reply =
        "Não consegui consultar essa informação neste momento. Posso tentar novamente ou verificar outro horário para você.";
    }
    if (!reply.trim()) {
      // O modelo terminou sem texto (ex.: encerrou logo após uma ferramenta):
      // ainda assim o paciente recebe uma resposta.
      diag.error_code = diag.error_code ?? "EMPTY_MODEL_RESPONSE";
      reply =
        "Não consegui concluir essa consulta agora. Pode me dizer novamente o médico e o horário desejado?";
    }

    // A conversa pode ter sido resolvida enquanto a Nina pensava: descarta.
    const atual = await carregarLead(supabaseAdmin, data.clinicaId, data.leadId);
    if (atual.conversa_id !== conversaId) {
      return {
        duplicada: false,
        reply: null,
        erro: "Conversa resolvida durante o processamento.",
        audio: null,
      };
    }

    // Revalida o dono ANTES de "enviar": a própria Nina pode ter transferido
    // a conversa durante a resposta.
    const estadoDepois = await estadoConversaPorId(data.clinicaId, conversaId);
    const transferida = !ninaPodeResponder(estadoDepois);

    // Paciente mandou áudio → Nina responde falando (mesma regra do WhatsApp).
    let audio: { base64: string; mime: string; texto: string } | null = null;
    let precisaTextoCompleto = true;
    if (reply.trim() && ehAudio) {
      try {
        const {
          respostaAudioDesativada,
          prepararParaFala,
          pareceLista,
          resumoFalado,
          sintetizarFala,
          LIMITE_FALA_CURTA,
        } = await import("@/lib/nina-audio.server");
        if (!(await respostaAudioDesativada(data.clinicaId))) {
          const longa = reply.length > LIMITE_FALA_CURTA || pareceLista(reply);
          const falado = longa ? resumoFalado(reply) : prepararParaFala(reply);
          const sintetizado = await sintetizarFala(falado);
          if (sintetizado) {
            audio = {
              base64: Buffer.from(sintetizado.bytes).toString("base64"),
              mime: sintetizado.mime,
              texto: falado,
            };
            precisaTextoCompleto = longa;
            await supabaseAdmin.from("whatsapp_mensagens").insert({
              clinica_id: data.clinicaId,
              conversa_id: conversaId,
              canal: CANAL_TESTE,
              wa_message_id: `${waId}-audio`,
              direction: "out",
              from_number: CANAL_TESTE,
              to_number: lead.telefone_sessao,
              body: `🎤 ${falado}`,
              tipo: "audio",
              transcricao: falado,
              media_mime: sintetizado.mime,
              status: "sent",
              enviada_por: "nina",
              is_teste: true,
            });
          }
        }
      } catch (e) {
        console.error("Nina teste: resposta em áudio falhou (caindo para texto)", e);
      }
    }

    if (reply.trim() && (!audio || precisaTextoCompleto)) {
      await supabaseAdmin.from("whatsapp_mensagens").insert({
        clinica_id: data.clinicaId,
        conversa_id: conversaId,
        canal: CANAL_TESTE,
        wa_message_id: `${waId}-reply`,
        direction: "out",
        from_number: CANAL_TESTE,
        to_number: lead.telefone_sessao,
        body: reply,
        tipo: "text",
        status: "sent",
        enviada_por: "nina",
        is_teste: true,
      });
    }
    if (reply.trim()) {
      await supabaseAdmin
        .from("atend_conversas")
        .update({
          ultima_msg_em: new Date().toISOString(),
          ultima_msg_preview: reply.slice(0, 160),
        })
        .eq("id", conversaId);
    }

    diag.response_saved = !!reply.trim();
    diag.duration_ms = Date.now() - t0;
    if (diag.processing_status !== "failed") diag.processing_status = "completed";
    console.info("[NINA_MESSAGE_PROCESSING]", diag);

    return {
      duplicada: false,
      reply,
      erro: falhaTecnica ? diag.error_message : null,
      audio,
      transferida,
    };
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
      tool_called: ultima?.ferramenta ?? null,
      tool_result: ultima ? (ultima.ok ? "ok" : (ultima.erro ?? "erro")) : null,
      updated_at: estado.updated_at,
    };

    return { eventos, debug };
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
    const lead = await carregarLead(supabaseAdmin, data.clinicaId, data.leadId);
    // Só encerra a conversa informada: nunca uma sessão nova já iniciada.
    if (lead.conversa_id !== data.conversaId) return { ok: true, jaResolvida: true };

    const agora = new Date().toISOString();
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        status: "finished",
        owner_type: "NONE",
        ai_enabled: false,
        atribuida_user_id: null,
        identidade_confirmada: false,
        identidade_perguntada_em: null,
        identidade_tentativas: 0,
        nina_fluxo_estado: null,
        handoff_resumo: null,
        handoff_motivo: null,
        closed_at: agora,
        resolved_at: agora,
      })
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);

    // Eventos persistentes na linha do tempo (nada de popup): o histórico
    // continua visível no console e mostra, no ponto exato, quem encerrou e
    // que a memória da Nina foi zerada.
    const { registrarMarcadorSistema, registrarEvento } = await import(
      "@/lib/atendimento/handoff.server"
    );
    await registrarEvento({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      evento: "FINALIZADA",
      userId: context.userId,
      detalhes: { sessao: lead.sessao_seq, origem: "console_teste" },
    });
    await registrarEvento({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      evento: "IA_MEMORIA_RESETADA",
      userId: context.userId,
      detalhes: { sessao: lead.sessao_seq },
    });

    // Limpeza opcional: apaga da agenda o que a Nina marcou nesta sessão de
    // teste. Só alcança registros de homologação (is_mock_data) desta conversa.
    let agendamentosRemovidos = 0;
    if (data.removerAgendamentos) {
      const { data: apagados } = await supabaseAdmin
        .from("agendamentos")
        .delete()
        .eq("clinica_id", data.clinicaId)
        .eq("origem_integracao", "nina_homologacao")
        .eq("is_mock_data", true)
        .like("id_externo", `${data.conversaId}|%`)
        .select("id");
      agendamentosRemovidos = (apagados ?? []).length;
      if (agendamentosRemovidos > 0) {
        await registrarMarcadorSistema({
          clinicaId: data.clinicaId,
          conversaId: data.conversaId,
          texto: `🧹 ${agendamentosRemovidos} agendamento(s) de teste removido(s) da agenda.`,
        }).catch(() => {});
      }
    }

    // Nova sessão = novo telefone virtual → a Nina não alcança nada do histórico
    // arquivado (que fica só para auditoria).
    const proxima = lead.sessao_seq + 1;

    await supabaseAdmin
      .from("nina_teste_leads")
      .update({
        sessao_seq: proxima,
        telefone_sessao: telefoneSessao(lead.indice, proxima),
        conversa_id: null,
        status: "ativa",
      })
      .eq("id", lead.id);

    return { ok: true, jaResolvida: false, sessao: proxima, agendamentosRemovidos };
  });
