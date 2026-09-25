/**
 * Núcleo server-only da homologação da Nina.
 *
 * Aqui vive o processamento de UMA mensagem de teste — exatamente o mesmo
 * pipeline usado pelo WhatsApp real (`gerarRespostaNina`), sem enviar nada à
 * Meta. É reutilizado pelo console de testes (envio manual e simulador) e pelo
 * motor de teste de carga (Fase 6), para que exista um único caminho de
 * processamento na homologação.
 */
import { removerEmojisNina } from "./resposta/sem-emojis";
import {
  carregarControleWatchdog,
  gerarComCheckpointNina,
  finalizarTextoComCheckpointNina,
  vincularSaidaWatchdogNina,
  entregarComCheckpointNina,
  finalizarWatchdogNina,
  ErroEntregaWatchdog,
  type ControleWatchdogNina,
} from "./watchdog.server";
import { criarGuardiaoReservaTurno } from "./reserva-turno";
import { comSessaoTesteExclusiva } from "./sessao-teste-exclusiva.server";
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
    .select(
      "id, indice, nome, telefone_base, telefone_sessao, sessao_seq, conversa_id, ciclo_id, ciclo_iniciado_em, resolvido_em, status",
    )
    .eq("clinica_id", clinicaId)
    .order("indice");
  if (e2) throw new Error(e2.message);
  return (data ?? []) as LeadRow[];
}

async function carregarLead(admin: any, clinicaId: string, leadId: string): Promise<LeadRow> {
  const { data, error } = await admin
    .from("nina_teste_leads")
    .select(
      "id, indice, nome, telefone_base, telefone_sessao, sessao_seq, conversa_id, ciclo_id, ciclo_iniciado_em, resolvido_em, status",
    )
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
      .in("conversa_id", ids)
      .is("nina_status", null);
    const excedente = (count ?? 0) - LIMITE_MENSAGENS_LEAD;
    if (excedente <= 0) return;
    const { data: antigas } = await admin
      .from("whatsapp_mensagens")
      .select("id")
      .eq("clinica_id", clinicaId)
      .in("conversa_id", ids)
      .is("nina_status", null)
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
export async function processarMensagemTeste(
  data: EntradaMensagemTeste,
  userId: string | null,
  retomada?: { turno: import("./burst.server").TurnoNina; mensagem: any; cicloId: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ehAudio = data.tipo === "audio";
  let textoPaciente = data.tipo === "text" || ehAudio ? data.texto : "";
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

  const { persistirEntradaNina } = await import("@/lib/nina/entrada-persistida.server");
  // Releia o lead SOMENTE depois de obter a mesma trava usada pelo reset.
  // Assim nenhum envio encontra o telefone/ciclo anterior durante o reinício.
  const { lead, conversaId, cicloId, waId, agora, entradaPersistida } =
    await comSessaoTesteExclusiva(data, async () => {
      const lead = await carregarLead(supabaseAdmin, data.clinicaId, data.leadId);
      if (retomada && (lead.ciclo_id !== retomada.cicloId || lead.conversa_id !== retomada.mensagem.conversa_id))
        throw new Error("TEST_SESSION_CHANGED");
      const { conversaId, cicloId } = retomada
        ? { conversaId: lead.conversa_id!, cicloId: retomada.cicloId }
        : await garantirCiclo(supabaseAdmin, data.clinicaId, lead, userId);
      const waId = retomada?.mensagem.wa_message_id ?? `test-${lead.id}-${data.chave}`;
      const agora = new Date().toISOString();
      const entradaPersistida = retomada
        ? { mensagem: retomada.mensagem, repetida: true, consumida: false }
        : await persistirEntradaNina(supabaseAdmin, {
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
      return { lead, conversaId, cicloId, waId, agora, entradaPersistida };
    });
  const msgEntrada = entradaPersistida.mensagem;
  if (entradaPersistida.consumida)
    return {
      duplicada: true,
      reply: null as string | null,
      erro: null,
      audio: null,
      transferida: false,
      processamento: "DUPLICADA" as const,
      absorvidaPeloLote: false,
      mensagemPersistida: true,
      mensagemId: msgEntrada.id as string,
    };
  if (entradaPersistida.repetida)
    textoPaciente =
      msgEntrada.tipo === "audio"
        ? (msgEntrada.transcricao ?? "")
        : msgEntrada.tipo === "text"
          ? (msgEntrada.body ?? "")
          : "";
  if (!entradaPersistida.repetida) {
    await supabaseAdmin
      .from("atend_conversas")
      .update({
        ultima_msg_em: agora,
        ultima_msg_preview: body.slice(0, 160),
        awaiting_patient_since: null,
        patient_response_deadline: null,
      })
      .eq("id", conversaId);
    // Teto atingido → apaga as mensagens mais antigas do lead para caber as novas.
    await podarMensagensLead(supabaseAdmin, data.clinicaId, { ...lead, conversa_id: conversaId });
  }

  const mensagemId = (msgEntrada as { id?: string } | null)?.id ?? null;
  // FASE 4 (mesmo mecanismo da produção): a mensagem JÁ está gravada e já
  // apareceu na tela; só agora a conversa muda de revisão. Qualquer resposta
  // gerada antes disso passa a ser considerada obsoleta.
  const { registrarRevisaoEntradaNina } = await import("@/lib/nina/entrada-persistida.server");
  await registrarRevisaoEntradaNina(supabaseAdmin, {
    clinicaId: data.clinicaId,
    telefone: lead.telefone_sessao,
    mensagemId: msgEntrada.id,
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
  const { estadoConversaPorId, ninaPodeResponder } =
    await import("@/lib/atendimento/handoff.server");
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

  const { RESPOSTA_AUDIO_FALHOU, respostaMidiaNaoSuportada } =
    await import("@/lib/whatsapp-midia.server");

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
  const auditoriaNina: {
    execucaoId?: string | null;
    traceId?: string | null;
    resultado?: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina;
    // FASE 5 — snapshot da avaliação final do texto entregue.
    decisaoId?: string | null;
    textoFinalHash?: string | null;
  } = {};
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
  let controle: ControleWatchdogNina | null = null;
  let erroProcessamento: unknown;
  let lockTurno: import("@/lib/nina/lock-conversa.server").LockConversa | null = null;
  const conferirReservaTurno = criarGuardiaoReservaTurno(async () => {
    if (!lockTurno) return true;
    const { validarReservaTurnoNina } = await import("@/lib/nina/burst.server");
    return validarReservaTurnoNina(lockTurno);
  });
  let revisaoTurno = 0;
  let entradasTurno: string[] = mensagemId ? [mensagemId] : [];
  if (textoPaciente) {
    const { aguardarTurnoNina } = await import("@/lib/nina/burst.server");
    let turno: import("@/lib/nina/burst.server").TurnoNina | null;
    try {
      turno =
        retomada?.turno ??
        (await aguardarTurnoNina({
          clinicaId: data.clinicaId,
          telefone: lead.telefone_sessao,
          conversaId,
          mensagemId,
          textoAtual: textoPaciente,
          sessaoTeste: { leadId: lead.id, cicloId },
        }));
    } catch (e) {
      // Falha anterior ao modelo: conservar entrada pendente e não inventar resposta.
      console.error("[NINA_TESTE] agrupamento pendente", e);
      return {
        duplicada: entradaPersistida.repetida,
        reply: null as string | null,
        erro: String((e as Error)?.message ?? e),
        audio: null,
        transferida: false,
        processamento: "ERRO" as const,
        absorvidaPeloLote: false,
        mensagemPersistida: true,
        mensagemId,
        recuperavel: (e as { podeRepetirEntrada?: boolean })?.podeRepetirEntrada === true,
      };
    }
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
    try {
      controle = await carregarControleWatchdog(turno);
    } catch (e) {
      const { liberarLockConversa } = await import("./lock-conversa.server");
      await liberarLockConversa(lockTurno);
      throw e;
    }
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
        reply = await gerarComCheckpointNina(controle, auditoriaNina, () =>
          gerarRespostaNina(data.clinicaId, textoDoTurno, lead.telefone_sessao, {
            validarReservaTurno: conferirReservaTurno,
            teste: true,
            ambiente: ambienteQA,
            auditoria: auditoriaNina,
            mensagensEntrada: entradasTurno,
            lote: { batchId: loteId || null, revisao: revisaoTurno || null },
            revisao: revisaoTurno
              ? { telefone: lead.telefone_sessao, valor: revisaoTurno }
              : undefined,
          }),
        );
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
      erroProcessamento = e;
      if ((e as { codigo?: string })?.codigo === "NINA_RESERVA_TURNO_PERDIDA") {
        statusFinal = "SUPERSEDED";
        console.warn("[NINA_TESTE] reserva perdida; sem resposta ou reenvio", { loteId });
        return {
          duplicada: false,
          reply: null,
          erro: "Reserva do turno perdida; execução interrompida sem reenvio.",
          audio: null,
          transferida: false,
          processamento: "OBSOLETA" as const,
          absorvidaPeloLote: false,
          mensagemPersistida: true,
          mensagemId,
        };
      }
      // O watchdog dá o mesmo desfecho que no WhatsApp: retry seguro ou handoff.
      // Não substituir a falha por uma resposta de teste que pareça sucesso.
      if (controle) throw e;
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
    // MJ-53: texto vazio após um aviso do protocolo é silêncio deliberado,
    // não EMPTY_MODEL_RESPONSE. O contrato precisa sobreviver até o chamador.
    const resultadoGeracao = auditoriaNina.resultado;
    const semNovaMensagem = resultadoGeracao?.estado === "descartar";
    if (semNovaMensagem) reply = "";
    if (!semNovaMensagem && !reply.trim()) {
      // O modelo terminou sem texto (ex.: encerrou logo após uma ferramenta):
      // ainda assim o paciente recebe uma resposta.
      diag.error_code = diag.error_code ?? "EMPTY_MODEL_RESPONSE";
      reply =
        "Não consegui concluir essa consulta agora. Pode me dizer novamente o médico e o horário desejado?";
    }

    // FASE 5 — a Homologação usa o MESMO serviço de finalização do WhatsApp:
    // o texto avaliado aqui é o texto que aparece na conversa de teste.
    if (lockTurno) {
      await conferirReservaTurno();
    }
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
        const finalizada = await finalizarTextoComCheckpointNina(controle, () =>
          finalizarResposta({
            clinicaId: data.clinicaId,
            canal: "test-console",
            chaveTurno: auditoriaNina.traceId ?? loteId ?? `${conversaId}|${mensagemId ?? ""}`,
            // FASE 4 — mesma raiz do turno: a Homologação também entrega a
            // última versão aprovada, nunca um candidato anterior à correção.
            chaveTurnoRaiz: auditoriaNina.traceId ?? loteId ?? `${conversaId}|${mensagemId ?? ""}`,
            conversaId,
            resultado: { ...base, texto: reply },
            // Homologação nunca resolve conversa de produção.
            avaliarEncerramento: false,
          }),
        );
        reply = finalizada.texto;
      } catch (e) {
        if (controle) throw e;
        console.error("[NINA_TESTE] finalização da resposta falhou", e);
      }
    }

    // Mesmo formato do WhatsApp, inclusive em retomadas de checkpoints antigos.
    reply = removerEmojisNina(reply);
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

    if (semNovaMensagem) {
      const aviso = resultadoGeracao?.avisoExistente;
      const avisoGravado = aviso?.estado === "confirmado" && Boolean(aviso.mensagemId);
      diag.response_saved = avisoGravado;
      diag.duration_ms = Date.now() - t0;
      if (diag.processing_status !== "failed") diag.processing_status = "completed";
      console.info("[NINA_MESSAGE_PROCESSING]", {
        ...diag,
        sem_nova_mensagem: true,
        aviso_mensagem_id: aviso?.mensagemId ?? null,
        aviso_estado: aviso?.estado ?? null,
      });
      // A saída já foi gravada pelo protocolo. Não finaliza outro texto,
      // não sintetiza áudio e não cria outra bolha. O finally libera o lote.
      return {
        duplicada: false,
        reply: null,
        erro: falhaTecnica ? diag.error_message : null,
        audio: null,
        transferida,
        processamento: avisoGravado ? ("RESPONDIDA" as const) : ("SEM_RESPOSTA" as const),
        absorvidaPeloLote: false,
        batchId: loteId || null,
        revisao: revisaoTurno || null,
        mensagemPersistida: true,
        mensagemId,
        semNovaMensagem: true,
        avisoMensagemId: aviso?.mensagemId ?? null,
        avisoEstado: aviso?.estado ?? null,
        turnoId: auditoriaNina.traceId ?? null,
        execucaoId: auditoriaNina.execucaoId ?? null,
        conversaId,
      };
    }

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
            await conferirReservaTurno();
            if (controle) {
              await entregarComCheckpointNina(
                controle,
                {
                  texto: falado,
                  tipo: "audio",
                  integral: !longa,
                  canal: "test-console",
                  from: CANAL_TESTE,
                  transcricao: falado,
                  mime: sintetizado.mime,
                  execucaoId: auditoriaNina.execucaoId,
                },
                async () => ({ wa_message_id: null }),
              );
            } else {
              const { data: saidaAudio, error: erroAudio } = await supabaseAdmin
                .from("whatsapp_mensagens")
                .insert({
                  clinica_id: data.clinicaId,
                  conversa_id: conversaId,
                  canal: CANAL_TESTE,
                  wa_message_id: `${waId}-audio`,
                  direction: "out",
                  from_number: CANAL_TESTE,
                  to_number: lead.telefone_sessao,
                  body: falado,
                  tipo: "audio",
                  transcricao: falado,
                  media_mime: sintetizado.mime,
                  status: "sent",
                  enviada_por: "nina",
                  execucao_id: auditoriaNina.execucaoId ?? null,
                  is_teste: true,
                })
                .select("id")
                .maybeSingle();
              if (erroAudio || !saidaAudio?.id) throw new Error("AUDIO_PERSISTENCE_FAILED");
              if (!loteId && !longa && mensagemId)
                await vincularSaidaWatchdogNina(mensagemId, saidaAudio.id);
            }
          }
        }
      } catch (e) {
        if ((e as { codigo?: string })?.codigo === "NINA_RESERVA_TURNO_PERDIDA") throw e;
        if (e instanceof ErroEntregaWatchdog) throw e;
        audio = null;
        precisaTextoCompleto = true;
        console.error("Nina teste: resposta em áudio falhou (caindo para texto)", e);
      }
    }

    if (reply.trim() && (!audio || precisaTextoCompleto)) {
      await conferirReservaTurno();
      const entregue = controle
        ? await entregarComCheckpointNina(
            controle,
            {
              texto: reply,
              tipo: "text",
              canal: "test-console",
              from: CANAL_TESTE,
              execucaoId: auditoriaNina.execucaoId,
            },
            async () => ({ wa_message_id: null }),
          )
        : null;
      const { data: msgOut, error: erroMsgOut } = entregue
        ? { data: { id: entregue.mensagemId }, error: null }
        : await supabaseAdmin
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
      if (erroMsgOut || !msgOut?.id) {
        diag.response_saved = false;
        throw new Error("RESPONSE_PERSISTENCE_FAILED");
      }
      if (!loteId && mensagemId) await vincularSaidaWatchdogNina(mensagemId, msgOut.id);
      diag.response_saved = true;
      // FASE 5 — mesmos estados da produção, no canal isolado de homologação.
      try {
        const { registrarEntregaSaida } = await import("@/lib/nina/entrega-saida.server");
        const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
        const idSaida = (msgOut as { id?: string } | null)?.id ?? null;
        // VÍNCULO CORRETO — a nota pertence ao texto avaliado. Se o texto
        // entregue for outro (aviso controlado, mensagem de sistema), a saída
        // é registrada SEM nota: a tela mostra "Resposta não avaliada".
        const hashEntregue = hashDoTexto(reply);
        const mesmoTextoAvaliado =
          Boolean(auditoriaNina.textoFinalHash) && auditoriaNina.textoFinalHash === hashEntregue;
        await registrarEntregaSaida({
          clinicaId: data.clinicaId,
          decisaoId: mesmoTextoAvaliado ? (auditoriaNina.decisaoId ?? null) : null,
          vincularAvaliacao: mesmoTextoAvaliado,
          execucaoId: auditoriaNina.execucaoId ?? null,
          conversaId,
          outgoingMessageId: idSaida,
          representacao: "texto_completo",
          // Homologação não tem transporte real: persistida, nunca "confirmada".
          estado: idSaida ? "persistida" : "falhou",
          textoHash: hashEntregue,
          detalhe: {
            canal: CANAL_TESTE,
            hash_avaliado: auditoriaNina.textoFinalHash ?? null,
            avaliada: mesmoTextoAvaliado,
            ...(mesmoTextoAvaliado ? {} : { motivo: "texto_entregue_difere_do_avaliado" }),
          },
        });
        // FASE 3 — o resumo do turno é gravado ANTES da persistência (com
        // mensagemId nulo). Só aqui existe o id da saída: o vínculo é
        // completado por um evento posterior, sem reescrever o resumo.
        const { gravarEntregaDoTurno } = await import("@/lib/nina/rastreio/turno.server");
        await gravarEntregaDoTurno({
          clinicaId: data.clinicaId,
          turnoId: auditoriaNina.traceId ?? null,
          execucaoId: auditoriaNina.execucaoId ?? null,
          conversaId,
          outgoingMessageId: idSaida,
          canal: CANAL_TESTE,
          textoHash: hashDoTexto(reply),
          // Homologação não tem transporte real: persistida, nunca confirmada.
          estado: idSaida ? "persistida" : "falhou",
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
      const { registrarEsperaAposRespostaNina } = await import("./espera-paciente.server");
      await registrarEsperaAposRespostaNina({
        clinicaId: data.clinicaId,
        conversaId,
        resposta: reply,
      });
    }

    diag.response_saved = diag.response_saved || Boolean(audio);
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
      // Identificadores EXATOS deste turno: quem for auditar recupera o
      // registro por ID, nunca pelo "último resumo da clínica".
      turnoId: auditoriaNina.traceId ?? null,
      execucaoId: auditoriaNina.execucaoId ?? null,
      conversaId,
    };
  } catch (e) {
    erroProcessamento = e;
    if ((e as { codigo?: string })?.codigo !== "NINA_RESERVA_TURNO_PERDIDA") throw e;
    statusFinal = "SUPERSEDED";
    console.warn("[NINA_TESTE] reserva perdida antes da entrega", { loteId });
    return {
      duplicada: false,
      reply: null,
      erro: "Reserva do turno perdida antes da entrega.",
      audio: null,
      transferida: false,
      processamento: "OBSOLETA" as const,
      absorvidaPeloLote: false,
      mensagemPersistida: true,
      mensagemId,
    };
  } finally {
    // Garantia única: nenhum lote/lock fica preso, em qualquer desfecho.
    try {
      await finalizarWatchdogNina(controle, erroProcessamento);
    } finally {
      await encerrarTurno(statusFinal);
    }
  }
}

/**
 * REGRA DA HOMOLOGAÇÃO — RESET REAL de um lead de teste (rotina canônica única).
 *
 * Só o botão "Resolver / Reiniciar teste" pode reiniciar uma sessão existente.
 * Por isso esta função exige `manual: true`: nenhum fluxo automático (LOW,
 * encaminhamento simulado, erro, timeout, fim de rodada, fim de ciclo, Terra,
 * cenários, carga) pode chamá-la. Quem precisa de sessão limpa deve sinalizar
 * a necessidade e aguardar o clique do operador.
 *
 * É idempotente: sem conversa aberta (ou com outra conversa já iniciada) não
 * cria sessão nova nem grava evento. Nunca apaga histórico: conversas,
 * mensagens, execuções e ciclos anteriores continuam gravados para auditoria.
 */
export class ResetManualObrigatorioError extends Error {
  constructor(origem: string) {
    super(
      `Reinício de sessão bloqueado (origem: ${origem}). Só o botão "Resolver / Reiniciar teste" pode reiniciar um lead de homologação.`,
    );
    this.name = "ResetManualObrigatorioError";
  }
}

async function executarResetLeadTeste(
  admin: any,
  entrada: {
    clinicaId: string;
    leadId: string;
    /** Quando informado, só reseta se o lead ainda estiver nesta conversa. */
    conversaId?: string | null;
    userId: string | null;
    removerAgendamentos?: boolean;
    origem?: string;
    /** Obrigatório: confirma que veio do clique do operador no botão. */
    manual: true;
  },
): Promise<{
  ok: true;
  jaResolvida: boolean;
  sessao: number;
  sessaoAnterior: number;
  cicloEncerrado: string | null;
  agendamentosRemovidos: number;
}> {
  if (entrada.manual !== true)
    throw new ResetManualObrigatorioError(entrada.origem ?? "desconhecida");

  const lead = await carregarLead(admin, entrada.clinicaId, entrada.leadId);

  // Idempotência: sem conversa aberta o lead já está limpo — nada a fazer,
  // nenhum evento novo, nenhum ciclo extra.
  if (!lead.conversa_id)
    return {
      ok: true,
      jaResolvida: true,
      sessao: lead.sessao_seq,
      sessaoAnterior: lead.sessao_seq,
      cicloEncerrado: null,
      agendamentosRemovidos: 0,
    };
  // Só encerra a conversa informada: nunca uma sessão nova já iniciada.
  if (entrada.conversaId && lead.conversa_id !== entrada.conversaId)
    return {
      ok: true,
      jaResolvida: true,
      sessao: lead.sessao_seq,
      sessaoAnterior: lead.sessao_seq,
      cicloEncerrado: null,
      agendamentosRemovidos: 0,
    };

  const conversaId = lead.conversa_id;
  const agora = new Date().toISOString();

  // 1) Impede que processamento antigo continue produzindo efeitos.
  //    A revisão da conversa sobe ANTES do resto: qualquer resposta que a Nina
  //    ainda estiver gerando do ciclo anterior passa a ser obsoleta.
  try {
    const { incrementarRevisaoConversa } = await import("@/lib/nina/revisao-conversa.server");
    await incrementarRevisaoConversa({
      clinicaId: entrada.clinicaId,
      telefone: lead.telefone_sessao,
      conversaId,
    });
  } catch (e) {
    console.error("[NINA_TESTE] revisão da conversa não pôde ser incrementada", e);
  }

  // Lotes de mensagens ainda abertos/reservados viram SUPERSEDED: não geram
  // resposta e não travam a conversa nova.
  await admin
    .from("nina_message_batches")
    .update({ status: "SUPERSEDED", processed_at: agora })
    .eq("clinica_id", entrada.clinicaId)
    .eq("conversa_id", conversaId)
    .in("status", ["COLLECTING", "PROCESSING"]);

  // Trava (lease de até 90s) do ciclo anterior é liberada de imediato.
  await admin
    .from("nina_conversa_locks")
    .update({ liberado_em: agora, expira_em: agora })
    .eq("clinica_id", entrada.clinicaId)
    .eq("chave", `${entrada.clinicaId}:${lead.telefone_sessao}`)
    .is("liberado_em", null);

  // 2) Encerra a conversa e zera a memória real da Nina.
  await admin
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
      // Invalida qualquer tarefa pendente do ciclo (espera do paciente,
      // encerramento automático, follow-up): nada dispara depois de resolver.
      patient_response_deadline: null,
      awaiting_patient_since: null,
      handoff_resumo: null,
      handoff_motivo: null,
      closed_at: agora,
      resolved_at: agora,
    })
    .eq("id", conversaId)
    .eq("clinica_id", entrada.clinicaId);

  // Eventos persistentes na linha do tempo (nada de popup): o histórico
  // continua visível no console e mostra, no ponto exato, quem encerrou e
  // que a memória da Nina foi zerada.
  const { registrarMarcadorSistema, registrarEvento } =
    await import("@/lib/atendimento/handoff.server");
  await registrarEvento({
    clinicaId: entrada.clinicaId,
    conversaId,
    evento: "FINALIZADA",
    userId: entrada.userId,
    detalhes: { sessao: lead.sessao_seq, origem: entrada.origem ?? "console_teste" },
  });
  await registrarEvento({
    clinicaId: entrada.clinicaId,
    conversaId,
    evento: "IA_MEMORIA_RESETADA",
    userId: entrada.userId,
    // Auditoria do reset manual: operador, horário, sessão anterior e nova.
    detalhes: {
      sessao: lead.sessao_seq,
      sessao_anterior: lead.sessao_seq,
      sessao_nova: lead.sessao_seq + 1,
      telefone_sessao_anterior: lead.telefone_sessao,
      telefone_sessao_nova: telefoneSessao(lead.indice, lead.sessao_seq + 1),
      operador: entrada.userId,
      origem: entrada.origem ?? "console_teste",
      em: agora,
    },
  });

  // Limpeza opcional: apaga da agenda o que a Nina marcou nesta sessão de
  // teste. Só alcança registros de homologação (is_mock_data) desta conversa.
  let agendamentosRemovidos = 0;
  if (entrada.removerAgendamentos) {
    const { data: apagados } = await admin
      .from("agendamentos")
      .delete()
      .eq("clinica_id", entrada.clinicaId)
      .eq("origem_integracao", "nina_homologacao")
      .eq("is_mock_data", true)
      .like("id_externo", `${conversaId}|%`)
      .select("id");
    agendamentosRemovidos = (apagados ?? []).length;
    if (agendamentosRemovidos > 0) {
      await registrarMarcadorSistema({
        clinicaId: entrada.clinicaId,
        conversaId,
        texto: `🧹 ${agendamentosRemovidos} agendamento(s) de teste removido(s) da agenda.`,
      }).catch(() => {});
    }
  }

  // Nova sessão = novo telefone virtual → a Nina não alcança nada do histórico
  // arquivado (que fica só para auditoria).
  const proxima = lead.sessao_seq + 1;

  // Encerra o ciclo atual (histórico preservado para auditoria) — a próxima
  // mensagem cria um novo test_cycle_id, sem memória do ciclo anterior.
  if (lead.ciclo_id) {
    const { patchEncerrarCiclo } = await import("@/lib/nina/ciclo-teste");
    await admin
      .from("nina_teste_ciclos")
      .update({
        ...patchEncerrarCiclo("resolvido_manual", agora),
        resolvido_por: entrada.userId,
      } as never)
      .eq("id", lead.ciclo_id)
      .eq("clinica_id", entrada.clinicaId);
  }

  await admin
    .from("nina_teste_leads")
    .update({
      sessao_seq: proxima,
      telefone_sessao: telefoneSessao(lead.indice, proxima),
      conversa_id: null,
      ciclo_id: null,
      ciclo_iniciado_em: null,
      resolvido_em: agora,
      status: "ativa",
    })
    .eq("id", lead.id);

  // 3) Confirmação de que o reset foi PERSISTIDO: só depois disso o chamador
  //    pode considerar o lead pronto.
  const depois = await carregarLead(admin, entrada.clinicaId, entrada.leadId);
  if (depois.conversa_id || depois.ciclo_id)
    throw new Error("Reset não confirmado: o lead continua com conversa/ciclo abertos");

  return {
    ok: true,
    jaResolvida: false,
    sessao: proxima,
    sessaoAnterior: lead.sessao_seq,
    cicloEncerrado: lead.ciclo_id,
    agendamentosRemovidos,
  };
}

export async function resetarLeadTeste(...args: Parameters<typeof executarResetLeadTeste>) {
  if (args[1].manual !== true)
    throw new ResetManualObrigatorioError(args[1].origem ?? "desconhecida");
  return comSessaoTesteExclusiva(args[1], () => executarResetLeadTeste(...args));
}

export {
  LIMITE_MENSAGENS_LEAD,
  CANAL_TESTE,
  TOTAL_LEADS,
  telefoneSessao,
  garantirLeads,
  carregarLead,
  garantirCiclo,
  conversasDoLead,
  podarMensagensLead,
};
export type { LeadRow };
