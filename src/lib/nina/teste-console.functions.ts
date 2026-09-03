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

    const { data: msgs, error } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id, direction, body, enviada_por, created_at")
      .eq("clinica_id", data.clinicaId)
      .in("conversa_id", ids)
      .order("created_at", { ascending: true })
      .limit(400);
    if (error) throw new Error(error.message);
    return {
      conversaId: lead.conversa_id,
      sessao: lead.sessao_seq,
      mensagens: (msgs ?? []) as any[],
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

    let reply = "";
    try {
      if (textoPaciente) {
        const { gerarRespostaNina } = await import("@/lib/whatsapp.server");
        reply = await gerarRespostaNina(data.clinicaId, textoPaciente, lead.telefone_sessao, {
          teste: true,
        });
      } else if (audioFalhou) {
        reply = RESPOSTA_AUDIO_FALHOU;
      } else {
        reply = respostaMidiaNaoSuportada(data.tipo);
      }
    } catch (e) {
      return {
        duplicada: false,
        reply: null,
        erro: String((e as Error)?.message ?? e).slice(0, 300),
        audio: null,
      };
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

    return {
      duplicada: false,
      reply,
      erro: null as string | null,
      audio,
      transferida,
    };
  });


export const resolverConversaTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        clinicaId: z.string().uuid(),
        leadId: z.string().uuid(),
        conversaId: z.string().uuid(),
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
        handoff_resumo: null,
        handoff_motivo: null,
        closed_at: agora,
        resolved_at: agora,
      })
      .eq("id", data.conversaId)
      .eq("clinica_id", data.clinicaId);

    // Marcador interno: o histórico continua visível no console, com o aviso
    // de que a sessão encerrou e a memória da Nina foi zerada.
    const { registrarMarcadorSistema } = await import("@/lib/atendimento/handoff.server");
    await registrarMarcadorSistema({
      clinicaId: data.clinicaId,
      conversaId: data.conversaId,
      texto: `✅ Conversa de teste encerrada (sessão ${lead.sessao_seq}). A memória da Nina foi resetada — a próxima mensagem começa do zero.`,
    }).catch(() => {});

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

    return { ok: true, jaResolvida: false, sessao: proxima };
  });
