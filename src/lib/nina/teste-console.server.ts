/**
 * Núcleo server-only da homologação da Nina.
 *
 * Aqui vive o processamento de UMA mensagem de teste — exatamente o mesmo
 * pipeline usado pelo WhatsApp real (`gerarRespostaNina`), sem enviar nada à
 * Meta. É reutilizado pelo console de testes (envio manual e simulador) e pelo
 * motor de teste de carga (Fase 6), para que exista um único caminho de
 * processamento na homologação.
 */
const CANAL_TESTE = "test-console";
const TOTAL_LEADS = 10;

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
  ciclo_id: string | null;
  ciclo_iniciado_em: string | null;
  resolvido_em: string | null;
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
    .select("id, indice, nome, telefone_base, telefone_sessao, sessao_seq, conversa_id, ciclo_id, ciclo_iniciado_em, resolvido_em, status")
    .eq("clinica_id", clinicaId)
    .order("indice");
  if (e2) throw new Error(e2.message);
  return (data ?? []) as LeadRow[];
}

async function carregarLead(admin: any, clinicaId: string, leadId: string): Promise<LeadRow> {
  const { data, error } = await admin
    .from("nina_teste_leads")
    .select("id, indice, nome, telefone_base, telefone_sessao, sessao_seq, conversa_id, ciclo_id, ciclo_iniciado_em, resolvido_em, status")
    .eq("clinica_id", clinicaId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead de teste não encontrado nesta clínica");
  return data as LeadRow;
}

/**
 * Garante o CICLO de teste atual do lead (test_cycle_id) e a conversa dele.
 *
 * Um ciclo = uma sessão isolada: telefone virtual próprio, conversa própria e
 * registro próprio em `nina_teste_ciclos` (com início, encerramento e situação).
 * Nada é compartilhado entre leads nem entre ciclos do mesmo lead.
 */
async function garantirCiclo(
  admin: any,
  clinicaId: string,
  lead: LeadRow,
  userId: string | null,
): Promise<{ conversaId: string; cicloId: string }> {
  if (lead.conversa_id && lead.ciclo_id)
    return { conversaId: lead.conversa_id, cicloId: lead.ciclo_id };

  // Criação atômica no banco: advisory lock por lead + índice único parcial
  // (nina_teste_ciclos_um_ativo_por_lead). Requisições concorrentes do mesmo
  // primeiro burst reutilizam exatamente o ciclo/conversa vencedores.
  const { data, error } = await admin.rpc("nina_teste_garantir_ciclo", {
    p_clinica_id: clinicaId,
    p_lead_id: lead.id,
    p_user_id: userId,
  });

  let cicloId: string | null = null;
  let conversaId: string | null = null;
  let criado = false;

  if (error) {
    // Defensivo: se ainda assim houver conflito de unicidade, reconsulta o vencedor.
    const { data: ativo } = await admin
      .from("nina_teste_ciclos")
      .select("id, conversa_id")
      .eq("lead_id", lead.id)
      .eq("status", "ativo")
      .maybeSingle();
    if (!ativo?.id || !ativo?.conversa_id) throw new Error(error.message);
    cicloId = ativo.id as string;
    conversaId = ativo.conversa_id as string;
  } else {
    const row = Array.isArray(data) ? data[0] : data;
    cicloId = (row as any)?.ciclo_id ?? null;
    conversaId = (row as any)?.conversa_id ?? null;
    criado = Boolean((row as any)?.criado);
  }

  if (!cicloId || !conversaId) throw new Error("Falha ao garantir ciclo de teste");

  if (!criado) return { conversaId, cicloId };

  // Divisor visual de início de ciclo (só leitura humana; não vai ao modelo).
  try {
    const { divisorInicioCiclo } = await import("@/lib/nina/ciclo-teste");
    const { registrarMarcadorSistema } = await import("@/lib/atendimento/handoff.server");
    await registrarMarcadorSistema({
      clinicaId,
      conversaId: conversaId as string,
      texto: divisorInicioCiclo(lead.sessao_seq),
    });
  } catch (e) {
    console.error("[NINA_TESTE] falha ao registrar divisor de início", e);
  }
  return { conversaId: conversaId as string, cicloId };

}

/** Teto de mensagens guardadas por lead de teste (todas as sessões somadas). */
const LIMITE_MENSAGENS_LEAD = 400;

/** IDs de todas as conversas de teste do lead (sessões atuais e anteriores). */
async function conversasDoLead(admin: any, clinicaId: string, lead: LeadRow): Promise<string[]> {
  const { data: convs } = await admin
    .from("atend_conversas")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("is_teste", true)
    .like("contato_telefone", `5500${String(lead.indice).padStart(2, "0")}%`);
  const ids = ((convs ?? []) as any[]).map((c) => c.id as string);
  if (lead.conversa_id && !ids.includes(lead.conversa_id)) ids.push(lead.conversa_id);
  return ids;
}

/**
 * Mantém no máximo LIMITE_MENSAGENS_LEAD mensagens por lead de teste: ao bater
 * o teto, as mais antigas são apagadas para dar lugar às novas.
 */
async function podarMensagensLead(admin: any, clinicaId: string, lead: LeadRow) {
  try {
    const ids = await conversasDoLead(admin, clinicaId, lead);
    if (ids.length === 0) return;
    const { count } = await admin
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", clinicaId)
      .in("conversa_id", ids);
    const excedente = (count ?? 0) - LIMITE_MENSAGENS_LEAD;
    if (excedente <= 0) return;
    const { data: antigas } = await admin
      .from("whatsapp_mensagens")
      .select("id")
      .eq("clinica_id", clinicaId)
      .in("conversa_id", ids)
      .order("created_at", { ascending: true })
      .limit(excedente);
    const alvo = ((antigas ?? []) as any[]).map((m) => m.id as string);
    if (alvo.length) await admin.from("whatsapp_mensagens").delete().in("id", alvo);
  } catch (e) {
    console.error("[NINA_TESTE] falha ao podar mensagens antigas", e);
  }
}



export type EntradaMensagemTeste = {
  clinicaId: string;
  leadId: string;
  tipo: "text" | "audio" | "image" | "document" | "sticker";
  texto: string;
  chave: string;
};

/** Processa uma mensagem de paciente de teste pelo pipeline real da Nina. */
export async function processarMensagemTeste(data: EntradaMensagemTeste, userId: string | null) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lead = await carregarLead(supabaseAdmin, data.clinicaId, data.leadId);
    const { conversaId, cicloId } = await garantirCiclo(
      supabaseAdmin,
      data.clinicaId,
      lead,
      userId,
    );

    const ehAudio = data.tipo === "audio";
    const textoPaciente = data.tipo === "text" || ehAudio ? data.texto : "";
    const audioFalhou = ehAudio && !textoPaciente;
    if (data.tipo === "text" && !textoPaciente) {
      // Nada foi gravado: o envio em si não aconteceu.
      return {
        duplicada: false,
        reply: null as string | null,
        erro: "Mensagem vazia.",
        audio: null,
        transferida: false,
        processamento: "ERRO" as const,
        absorvidaPeloLote: false,
        mensagemPersistida: false,
        mensagemId: null as string | null,
      };
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
    if (jaExiste)
      return {
        duplicada: true,
        reply: null as string | null,
        erro: null,
        audio: null,
        transferida: false,
        processamento: "DUPLICADA" as const,
        absorvidaPeloLote: false,
        // A mensagem do paciente já existe: envio bem-sucedido, sem regravar.
        mensagemPersistida: true,
        mensagemId: ((jaExiste as { id?: string } | null)?.id ?? null) as string | null,
      };

    const agora = new Date().toISOString();
    const { data: msgEntrada } = await supabaseAdmin.from("whatsapp_mensagens").insert({
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
    }).select("id").maybeSingle();
    await supabaseAdmin
      .from("atend_conversas")
      .update({ ultima_msg_em: agora, ultima_msg_preview: body.slice(0, 160) })
      .eq("id", conversaId);
    // Teto atingido → apaga as mensagens mais antigas do lead para caber as novas.
    await podarMensagensLead(supabaseAdmin, data.clinicaId, { ...lead, conversa_id: conversaId });

    const mensagemId = (msgEntrada as { id?: string } | null)?.id ?? null;
    // FASE 4 (mesmo mecanismo da produção): a mensagem JÁ está gravada e já
    // apareceu na tela; só agora a conversa muda de revisão. Qualquer resposta
    // gerada antes disso passa a ser considerada obsoleta.
    const { incrementarRevisaoConversa } = await import("@/lib/nina/revisao-conversa.server");
    await incrementarRevisaoConversa({
      clinicaId: data.clinicaId,
      telefone: lead.telefone_sessao,
      conversaId,
    });





    // Nina desligada na clínica → mesmo comportamento do WhatsApp: não responde.
    const { ninaDesativadaNaClinica } = await import("@/lib/nina-desligada.server");
    if (await ninaDesativadaNaClinica(data.clinicaId)) {
      // A mensagem do paciente ESTÁ gravada; só a Nina não responde.
      return {
        duplicada: false,
        reply: null,
        erro: "A Nina está desativada nesta clínica.",
        audio: null,
        transferida: false,
        processamento: "SEM_RESPOSTA" as const,
        absorvidaPeloLote: false,
        mensagemPersistida: true,
        mensagemId,
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
        // Mantido como no contrato anterior: quem observa transferência usa
        // `transferida` da resposta gerada, não deste bloqueio prévio.
        transferida: false,
        processamento: "SEM_RESPOSTA" as const,
        absorvidaPeloLote: false,
        mensagemPersistida: true,
        mensagemId,
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
    /** Entrada lógica da Nina: uma mensagem OU o turno consolidado do lote. */
    let textoDoTurno = textoPaciente;
    // Auditoria: id da execução que produziu esta resposta.
    const auditoriaNina: { execucaoId?: string | null } = {};
    // FASE 4 — ambiente real desta execução: se existe uma simulação em
    // andamento para este lead, a origem é o Test Runner (teste automatizado);
    // caso contrário é a Homologação manual. Nunca vem do navegador.
    let simulacaoAtiva = false;
    try {
      const { data: simAtiva } = await supabaseAdmin
        .from("nina_teste_simulacoes")
        .select("id")
        .eq("clinica_id", data.clinicaId)
        .eq("lead_id", lead.id)
        .eq("status", "executando")
        .limit(1)
        .maybeSingle();
      simulacaoAtiva = !!simAtiva;
    } catch {
      simulacaoAtiva = false;
    }
    const { ambienteDaExecucao } = await import("@/lib/nina/confianca-execucao");
    const ambienteQA = ambienteDaExecucao({ teste: true, simulacaoAtiva });

    // FASE 2/3 — MESMO agrupamento do WhatsApp real: mensagens seguidas do
    // mesmo lead formam UM turno lógico, com UMA execução da Nina. A janela e
    // a trava são as canônicas (`burst.server`), sem espera nova aqui.
    let loteId = "";
    let lockTurno: import("@/lib/nina/lock-conversa.server").LockConversa | null = null;
    let revisaoTurno = 0;
    let entradasTurno: string[] = mensagemId ? [mensagemId] : [];
    if (textoPaciente) {
      const { aguardarTurnoNina } = await import("@/lib/nina/burst.server");
      const turno = await aguardarTurnoNina({
        clinicaId: data.clinicaId,
        telefone: lead.telefone_sessao,
        conversaId,
        mensagemId,
        textoAtual: textoPaciente,
        mensagensFallback: entradasTurno,
      });
      if (!turno) {
        // Situação NORMAL: uma mensagem mais nova do mesmo lead ficou
        // responsável pelo turno. Esta chamada encerra sem gerar resposta —
        // não é erro, não tenta de novo e não avisa "a Nina não respondeu".
        return {
          duplicada: false,
          reply: null as string | null,
          erro: null as string | null,
          audio: null,
          transferida: false,
          processamento: "AGRUPADA" as const,
          absorvidaPeloLote: true,
          mensagemPersistida: true,
          mensagemId,
        };
      }
      loteId = turno.batchId;
      lockTurno = turno.lock;
      revisaoTurno = turno.revisao;
      if (turno.mensagens.length) entradasTurno = turno.mensagens;
      textoDoTurno = turno.texto;
    }

    /** Fecha o lote e solta a trava — sempre, qualquer que seja o desfecho. */
    const encerrarTurno = async (status: "PROCESSED" | "SUPERSEDED" = "PROCESSED") => {
      if (!loteId && !lockTurno) return;
      try {
        const { concluirTurnoNina } = await import("@/lib/nina/burst.server");
        await concluirTurnoNina(loteId, auditoriaNina.execucaoId ?? null, lockTurno, status);
      } catch (e) {
        console.error("[NINA_TESTE] encerramento do turno falhou", e);
      } finally {
        loteId = "";
        lockTurno = null;
      }
    };
    /** Desfecho do turno; vira SUPERSEDED quando a execução é descartada. */
    let statusFinal: "PROCESSED" | "SUPERSEDED" = "PROCESSED";
    /** FASE 5 — origem determinística do texto, quando não veio do modelo. */
    let resultadoTurno: {
      origem: import("@/lib/nina/resposta/contrato").OrigemResultado;
      chave: string;
    } | null = null;

    // Tudo o que vier depois do claim fica sob `finally`: sucesso, exceção,
    // resposta obsoleta ou erro do modelo sempre liberam lote e trava.
    try {
    try {
      if (textoPaciente) {
        const { gerarRespostaNina } = await import("@/lib/whatsapp.server");
        diag.model_called = true;
        reply = await gerarRespostaNina(data.clinicaId, textoDoTurno, lead.telefone_sessao, {
          teste: true,
          ambiente: ambienteQA,
          auditoria: auditoriaNina,
          mensagensEntrada: entradasTurno,
          lote: { batchId: loteId || null, revisao: revisaoTurno || null },
          revisao: revisaoTurno
            ? { telefone: lead.telefone_sessao, valor: revisaoTurno }
            : undefined,
        });
        // Rastreabilidade: as mensagens físicas do lote apontam para a única
        // execução que as processou.
        if (auditoriaNina.execucaoId && entradasTurno.length) {
          try {
            await supabaseAdmin
              .from("whatsapp_mensagens")
              .update({ execucao_id: auditoriaNina.execucaoId })
              .in("id", entradasTurno)
              .is("execucao_id", null);
          } catch (e) {
            console.error("[NINA_TESTE] marcação de execução na entrada falhou", e);
          }
        }
      } else if (audioFalhou) {
        const { CHAVE_TEMPLATE_AUDIO_FALHOU } = await import("@/lib/whatsapp-midia.server");
        resultadoTurno = { origem: "midia", chave: CHAVE_TEMPLATE_AUDIO_FALHOU };
        reply = RESPOSTA_AUDIO_FALHOU;
      } else {
        const { chaveTemplateMidia } = await import("@/lib/whatsapp-midia.server");
        resultadoTurno = { origem: "midia", chave: chaveTemplateMidia(data.tipo) };
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
      resultadoTurno = { origem: "erro", chave: "erro.tecnico" };
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

    // FASE 5 — a Homologação usa o MESMO serviço de finalização do WhatsApp:
    // o texto avaliado aqui é o texto que aparece na conversa de teste.
    if (reply.trim()) {
      try {
        const { finalizarResposta } = await import("@/lib/nina/resposta/finalizacao.server");
        const { criarResultado } = await import("@/lib/nina/resposta/contrato");
        const doGate = (
          auditoriaNina as {
            resultado?: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina;
          }
        ).resultado;
        const base =
          doGate ??
          criarResultado({
            origem: resultadoTurno?.origem ?? "modelo",
            texto: reply,
            chaveTemplate: resultadoTurno?.chave ?? null,
          });
        const finalizada = await finalizarResposta({
          clinicaId: data.clinicaId,
          canal: "test-console",
          chaveTurno: auditoriaNina.traceId ?? loteId ?? `${conversaId}|${mensagemId ?? ""}`,
          conversaId,
          resultado: { ...base, texto: reply },
          // Homologação nunca resolve conversa de produção.
          avaliarEncerramento: false,
        });
        reply = finalizada.texto;
      } catch (e) {
        console.error("[NINA_TESTE] finalização da resposta falhou", e);
      }
    }

    // A conversa pode ter sido resolvida enquanto a Nina pensava: descarta.
    const atual = await carregarLead(supabaseAdmin, data.clinicaId, data.leadId);
    // Resposta atrasada: se o ciclo foi encerrado (ou já é outro) enquanto a
    // Nina pensava, a resposta é descartada e nunca entra na conversa nova.
    if (atual.conversa_id !== conversaId || atual.ciclo_id !== cicloId) {
      statusFinal = "SUPERSEDED";
      return {
        duplicada: false,
        reply: null,
        erro: "Conversa resolvida durante o processamento.",
        audio: null,
        transferida: false,
        processamento: "OBSOLETA" as const,
        absorvidaPeloLote: false,
        mensagemPersistida: true,
        mensagemId,
      };
    }

    // FASE 4 — chegou mensagem nova durante a geração? Então esta resposta é
    // velha: não é gravada. O próximo lote reprocessa com o contexto completo.
    if (revisaoTurno) {
      const { respostaObsoleta } = await import("@/lib/nina/revisao-conversa.server");
      if (
        await respostaObsoleta({
          clinicaId: data.clinicaId,
          telefone: lead.telefone_sessao,
          revisaoProcessada: revisaoTurno,
        })
      ) {
        statusFinal = "SUPERSEDED";
        return {
          duplicada: false,
          reply: null,
          erro: null,
          audio: null,
          transferida: false,
          processamento: "OBSOLETA" as const,
          absorvidaPeloLote: true,
          mensagemPersistida: true,
          mensagemId,
        };
      }
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
              execucao_id: auditoriaNina.execucaoId ?? null,
              is_teste: true,
            });
          }
        }
      } catch (e) {
        console.error("Nina teste: resposta em áudio falhou (caindo para texto)", e);
      }
    }

    if (reply.trim() && (!audio || precisaTextoCompleto)) {
      const { data: msgOut } = await supabaseAdmin
        .from("whatsapp_mensagens")
        .insert({
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
          execucao_id: auditoriaNina.execucaoId ?? null,
          is_teste: true,
        })
        .select("id")
        .maybeSingle();
      // FASE 6 — mesmo vínculo da produção: snapshot ↔ mensagem enviada.
      try {
        const { vincularSnapshotMensagemEnviada } = await import(
          "@/lib/nina/confidence-engine.server"
        );
        await vincularSnapshotMensagemEnviada({
          clinicaId: data.clinicaId,
          execucaoId: auditoriaNina.execucaoId ?? null,
          outgoingMessageId: (msgOut as { id?: string } | null)?.id ?? null,
        });
      } catch {
        // Vínculo é auditoria: nunca interrompe a homologação.
      }
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
      processamento: (falhaTecnica ? "ERRO" : "RESPONDIDA") as
        | "RESPONDIDA"
        | "AGRUPADA"
        | "OBSOLETA"
        | "DUPLICADA"
        | "SEM_RESPOSTA"
        | "ERRO",
      absorvidaPeloLote: false,
      batchId: loteId || null,
      revisao: revisaoTurno || null,
      mensagemPersistida: true,
      mensagemId,
    };
    } finally {
      // Garantia única: nenhum lote/lock fica preso, em qualquer desfecho.
      await encerrarTurno(statusFinal);
    }
}

export { LIMITE_MENSAGENS_LEAD, CANAL_TESTE, TOTAL_LEADS, telefoneSessao, garantirLeads, carregarLead, garantirCiclo, conversasDoLead, podarMensagensLead };
export type { LeadRow };
