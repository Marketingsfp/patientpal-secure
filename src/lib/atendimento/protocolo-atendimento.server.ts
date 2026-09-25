/**
 * PROTOCOLO DE ATENDIMENTO (MJ-1, MJ-2, ...) — server-only.
 *
 * Regra de negócio (Policlínica Menino Jesus):
 *
 *  - O número é gerado APENAS em dois momentos confirmados:
 *      1) a transferência da Nina para uma atendente humana foi efetivada
 *         (alguém realmente assumiu / recebeu a conversa);
 *      2) um agendamento foi gravado e reconferido no banco.
 *  - Um protocolo por ATENDIMENTO (ciclo). O ciclo é o `session_id` da Nina:
 *    quando a conversa é reaberta depois de resolvida, nasce uma sessão nova e
 *    o próximo gatilho gera outro número. Protocolos antigos ficam no histórico
 *    de eventos — nada é sobrescrito nem renumerado.
 *  - A sequência é única por clínica e vive no banco
 *    (`atend_gerar_protocolo_atendimento`, com lock por clínica). O frontend e
 *    a IA nunca calculam o número.
 *  - Só existe protocolo onde há configuração ativa. Hoje: Menino Jesus.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ambienteDoHandoff, vinculoProtocolo } from "./protocolo-handoff";
import { classificarMotivoHandoff, type MotivoHandoff } from "./mensagem-handoff";
import { nomeContato } from "./rotulo-conversa";
import { motivoProfissionalSfp } from "@/lib/nina/regras-catalogo";
import type { StatusEnvioHandoff, TransporteHandoff } from "./handoff-auditoria";
import type {
  AmbienteAviso,
  OrigemAviso,
  ResultadoAvisoEncaminhamento,
} from "./aviso-encaminhamento";



export type ProtocoloGerado = { protocolo: string; novo: boolean } | null;

type LinhaConversa = {
  protocolo_atendimento: string | null;
  protocolo_sessao_id: string | null;
  handoff_em: string | null;
  handoff_motivo: string | null;
  contato_telefone: string | null;
  contato_nome: string | null;
  whatsapp_profile_name: string | null;
  departamento_id: string | null;
  is_teste: boolean | null;
  nina_fluxo_estado: unknown;
};

function sessionIdDoEstado(estado: unknown): string | null {
  const s = (estado as { session_id?: unknown } | null)?.session_id;
  return typeof s === "string" && s.length > 0 ? s : null;
}

async function lerConversa(clinicaId: string, conversaId: string) {
  const { data } = await supabaseAdmin
    .from("atend_conversas")
    .select(
      "protocolo_atendimento, protocolo_sessao_id, handoff_em, handoff_motivo, contato_telefone, contato_nome, whatsapp_profile_name, departamento_id, is_teste, nina_fluxo_estado",
    )
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return (data as LinhaConversa | null) ?? null;
}

/**
 * Gera (ou reaproveita) o protocolo do atendimento atual.
 * Devolve `null` quando a clínica não usa protocolo — nenhum efeito colateral.
 */
export async function garantirProtocoloAtendimento(args: {
  clinicaId: string;
  conversaId: string;
  gatilho: "transferencia" | "agendamento" | "handoff";
  userId?: string | null;
  handoffEventoId?: string | null;
  detalhes?: Record<string, unknown> | null;
}): Promise<ProtocoloGerado> {
  const conv = await lerConversa(args.clinicaId, args.conversaId);
  if (!conv) return null;

  const { data, error } = await supabaseAdmin.rpc("atend_gerar_protocolo_atendimento", {
    _clinica_id: args.clinicaId,
    _conversa_id: args.conversaId,
    _session_id: sessionIdDoEstado(conv.nina_fluxo_estado) ?? undefined,
  });
  if (error) {
    console.error("[protocolo] falha ao gerar", error.message);
    return null;
  }
  const linha = (data as Array<{ protocolo: string; novo: boolean }> | null)?.[0];
  if (!linha?.protocolo) return null;

  if (linha.novo) {
    // Auditoria: o protocolo fica ligado ao evento que o justificou.
    const { registrarEvento } = await import("./handoff.server");
    const evento =
      args.gatilho === "agendamento"
        ? "ATENDIMENTO_ENCERRADO"
        : args.gatilho === "handoff"
          ? "HANDOFF_SOLICITADO"
          : "ASSUMIDA";
    await registrarEvento({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      evento,
      userId: args.userId ?? null,
      motivo: `Protocolo ${linha.protocolo} gerado (${args.gatilho})`,
      detalhes: vinculoProtocolo({
        conversaId: args.conversaId,
        handoffEventoId: args.handoffEventoId ?? null,
        protocolo: linha.protocolo,
        ambiente: ambienteDoHandoff(conv.is_teste),
      }) as unknown as Record<string, unknown>,
    });
  }
  return { protocolo: linha.protocolo, novo: linha.novo };
}

/**
 * FASE 1 — o protocolo nasce no momento em que o handoff é EFETIVAMENTE
 * iniciado (backend já validou e a conversa saiu da Nina), em qualquer
 * ambiente. Não envia nada ao paciente: a mensagem é a próxima fase.
 */
export async function protocoloAoIniciarHandoff(args: {
  clinicaId: string;
  conversaId: string;
  handoffEventoId?: string | null;
  /** FASE 3 — comunica o encaminhamento e o protocolo ao paciente. */
  anunciar?: boolean;
  /** Turno/sessão de origem — identidade persistente da operação de aviso. */
  turnoId?: string | null;
  sessaoId?: string | null;
}): Promise<
  (NonNullable<ProtocoloGerado> & { anuncio: ResultadoAnuncioHandoff | null }) | null
> {
  const r = await garantirProtocoloAtendimento({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    gatilho: "handoff",
    handoffEventoId: args.handoffEventoId ?? null,
  });
  if (!r) return null;
  // O paciente só é avisado depois que o número existe de fato.
  const anuncio =
    args.anunciar === false
      ? null
      : await anunciarHandoffAoPaciente({
          clinicaId: args.clinicaId,
          conversaId: args.conversaId,
          protocolo: r.protocolo,
          turnoId: args.turnoId ?? null,
          sessaoId: args.sessaoId ?? null,
          handoffEventoId: args.handoffEventoId ?? null,
        });
  return { ...r, anuncio };
}

/**
 * RESPONSÁVEL ÚNICO PELO AVISO — quem já falou com o paciente sobre este
 * encaminhamento? Devolve o anúncio vigente (protocolo + mensagem entregue)
 * para que a finalização da Nina NÃO produza um segundo aviso no mesmo turno.
 *
 * Só considera anúncio de fato entregue: evento com `protocolo_informado` e
 * `message_id`. Falha de envio não conta como aviso dado.
 */
export async function anuncioHandoffVigente(
  clinicaId: string,
  conversaId: string,
  desde?: string | null,
): Promise<{ protocolo: string | null; mensagemId: string | null; em: string } | null> {
  const { data } = await supabaseAdmin
    .from("atend_conversa_eventos")
    .select("detalhes, created_at")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(50);
  for (const e of (data ?? []) as Array<{ detalhes: unknown; created_at: string }>) {
    if (desde && e.created_at < desde) continue;
    const d = e.detalhes as
      | { protocolo_informado?: unknown; protocol_number?: unknown; message_id?: unknown }
      | null;
    if (!d?.protocolo_informado) continue;
    const mensagemId = typeof d.message_id === "string" ? d.message_id : null;
    if (!mensagemId) continue;
    return {
      protocolo: typeof d.protocol_number === "string" ? d.protocol_number : null,
      mensagemId,
      em: e.created_at,
    };
  }
  return null;
}


/**
 * Mensagem transacional (sistema) para o paciente. Usada quando a Nina já foi
 * silenciada pelo encaminhamento: o envio não reativa a IA.
 * Falha de envio NÃO desfaz o protocolo nem a transferência.
 *
 * FASE 6 — devolve o vínculo da mensagem (id, status, transporte) para a
 * auditoria conseguir dizer em QUAL mensagem o protocolo foi informado.
 */
type ResultadoEnvio = {
  ok: boolean;
  mensagemId: string | null;
  status: StatusEnvioHandoff;
  transporte: TransporteHandoff;
  /** Identificador do transporte (só existe quando saiu de fato). */
  transporteId: string | null;
};

async function enviarTextoSistema(
  clinicaId: string,
  conversaId: string,
  texto: string,
  /**
   * Execução da Nina que originou este encaminhamento. Sem ela a mensagem
   * fica órfã: existe para o paciente e não existe para o turno.
   */
  execucaoId: string | null,
): Promise<ResultadoEnvio> {
  const conv = await lerConversa(clinicaId, conversaId);
  const { registrarMarcadorSistema } = await import("./handoff.server");
  // Conversa de homologação nunca dispara mensagem real.
  if (conv?.is_teste) {
    // FASE 4 — paridade: em Homologação a mensagem é a MESMA (mesmo protocolo,
    // mesmo texto contextual) e aparece no chat de teste como fala da Nina.
    // Só o transporte muda: nada sai para o WhatsApp real.
    const { data, error } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .insert({
        clinica_id: clinicaId,
        conversa_id: conversaId,
        canal: "test-console",
        wa_message_id: `handoff-${conversaId}-${Date.now()}`,
        direction: "out",
        from_number: "test-console",
        to_number: conv.contato_telefone,
        body: texto,
        tipo: "text",
        status: "sent",
        enviada_por: "nina",
        is_teste: true,
        execucao_id: execucaoId,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[protocolo] falha ao registrar mensagem de teste", error.message);
      return {
        ok: false,
        mensagemId: null,
        status: "falhou",
        transporte: "test-console",
        transporteId: null,
      };
    }
    return {
      ok: true,
      mensagemId: ((data as { id?: string } | null)?.id ?? null),
      status: "sent",
      transporte: "test-console",
      transporteId: null,
    };
  }
  if (!conv || !conv.contato_telefone) {
    await registrarMarcadorSistema({ clinicaId, conversaId, texto });
    return {
      ok: true,
      mensagemId: null,
      status: "sent",
      transporte: "marcador_interno",
      transporteId: null,
    };
  }
  try {
    const { loadWhatsAppConfig, metaSendText } = await import("@/lib/whatsapp.server");
    const cfg = await loadWhatsAppConfig(clinicaId);
    if (!cfg?.phone_number_id || !cfg.access_token) {
      await registrarMarcadorSistema({ clinicaId, conversaId, texto });
      return {
        ok: false,
        mensagemId: null,
        status: "nao_enviado",
        transporte: "marcador_interno",
        transporteId: null,
      };
    }
    const to = conv.contato_telefone.startsWith("+")
      ? conv.contato_telefone
      : `+${conv.contato_telefone}`;
    const { wa_message_id } = await metaSendText(
      cfg.phone_number_id,
      cfg.access_token,
      to,
      texto,
    );
    const { data } = await supabaseAdmin
      .from("whatsapp_mensagens")
      .insert({
        clinica_id: clinicaId,
        conversa_id: conversaId,
        wa_message_id,
        direction: "out",
        from_number: cfg.display_phone_number,
        to_number: to,
        body: texto,
        tipo: "text",
        status: "sent",
        enviada_por: "sistema",
        execucao_id: execucaoId,
      })
      .select("id")
      .maybeSingle();
    return {
      ok: true,
      mensagemId: ((data as { id?: string } | null)?.id ?? null),
      status: "sent",
      transporte: "whatsapp",
      transporteId: wa_message_id ?? null,
    };
  } catch (e) {
    // Sem marcar como entregue: o registro fica apenas como aviso interno.
    console.error("[protocolo] falha ao enviar mensagem de protocolo", e);
    await registrarMarcadorSistema({
      clinicaId,
      conversaId,
      texto: `⚠️ Não foi possível enviar ao paciente: ${texto}`,
    });
    // Falha de envio NÃO marca como informado: o retry reaproveita o MESMO
    // protocolo e tenta a comunicação de novo.
    return {
      ok: false,
      mensagemId: null,
      status: "falhou",
      transporte: "whatsapp",
      transporteId: null,
    };
  }
}


/**
 * FASE 3 — comunica ao paciente a transferência + o protocolo real.
 *
 * A comunicação tem DUAS etapas separadas, de propósito:
 *   1. PREPARAR — monta o texto (com o protocolo dentro) sem nada sair.
 *   2. ENTREGAR — único responsável pelo envio, protegido pelo registro
 *      durável de idempotência (ver `aviso-encaminhamento.server.ts`).
 *
 * Assim a finalização da Nina pode saber que o aviso JÁ foi preparado/entregue
 * por este turno e não produzir uma segunda bolha para o paciente.
 */
export type ResultadoAnuncioHandoff = {
  informado: boolean;
  mensagemId: string | null;
  mensagemTexto: string | null;
  origem: "modelo" | "contingencia" | null;
  status: StatusEnvioHandoff;
  transporte: TransporteHandoff;
  /** Já havia sido informado antes: esta chamada foi um retry sem reenvio. */
  retry: boolean;
  setor: string | null;
  /** Estado estruturado da operação de aviso (chave, estado, protocolo). */
  aviso: ResultadoAvisoEncaminhamento | null;
};

/** ETAPA 1 — o aviso pronto, ainda não entregue. */
export type AvisoPreparado = {
  texto: string;
  origem: "modelo" | "contingencia";
  setor: string | null;
  protocolo: string;
  ambiente: AmbienteAviso;
};

export async function prepararAvisoHandoff(args: {
  clinicaId: string;
  conversaId: string;
  protocolo: string;
}): Promise<AvisoPreparado | null> {
  const conv = await lerConversa(args.clinicaId, args.conversaId);
  if (!conv) return null;
  // Vale também para atribuição posterior e retry: SFP nunca gera aviso ao paciente.
  if (motivoProfissionalSfp(conv.handoff_motivo ?? "")) return null;
  const setor = await nomeDepartamento(args.clinicaId, conv.departamento_id);
  const { gerarMensagemHandoff } = await import("./mensagem-handoff.server");
  // O texto de transferência usa a MESMA identidade publicada do atendimento;
  // sem identidade válida ele fala de forma neutra.
  const { identidadeEfetivaAtual, identidadeParaMensagens } = await import(
    "@/lib/nina/identidade-efetiva.server"
  );
  const identidade = identidadeParaMensagens(await identidadeEfetivaAtual("whatsapp"));
  const { texto: textoAviso, origem } = await gerarMensagemHandoff({
    protocolo: args.protocolo,
    nome: nomeContato(conv),
    setor,
    motivo: await motivoDoHandoff(args.clinicaId, args.conversaId),
    identidade,
  });
  // Homologação: é a mesma mensagem da produção, com o aviso de simulação no
  // fim (nenhuma atendente real é acionada). Continua sendo a única mensagem.
  const { AVISO_SIMULACAO_ENCAMINHAMENTO } = await import("@/lib/nina/catalogo-sem-registro");
  const texto = conv.is_teste
    ? `${textoAviso.trim()}\n\n${AVISO_SIMULACAO_ENCAMINHAMENTO}`
    : textoAviso;
  return {
    texto,
    origem,
    setor,
    protocolo: args.protocolo,
    ambiente: conv.is_teste ? "homologacao" : "producao",
  };
}

/**
 * ETAPA 2 — ÚNICO RESPONSÁVEL PELA ENTREGA.
 *
 * Toda a proteção contra duplicidade acontece aqui, sobre o registro durável:
 * quem ganha a reserva envia; retry do mesmo turno reaproveita; chamada
 * concorrente aguarda; resultado incerto confere antes de reenviar; tentativa
 * nunca é tratada como entrega confirmada.
 */
export async function anunciarHandoffAoPaciente(args: {
  clinicaId: string;
  conversaId: string;
  protocolo: string;
  userId?: string | null;
  /** Turno/sessão de origem — identidade persistente da operação. */
  turnoId?: string | null;
  sessaoId?: string | null;
  handoffEventoId?: string | null;
}): Promise<ResultadoAnuncioHandoff> {
  const vazio: ResultadoAnuncioHandoff = {
    informado: false,
    mensagemId: null,
    mensagemTexto: null,
    origem: null,
    status: "nao_enviado",
    transporte: "nenhum",
    retry: false,
    setor: null,
    aviso: null,
  };
  const preparado = await prepararAvisoHandoff(args);
  if (!preparado) return vazio;
  const { texto, origem, setor, ambiente } = preparado;

  // Vínculo com a operação: esta mensagem pertence ao turno que pediu o
  // encaminhamento. Sem o id da execução ela fica órfã na auditoria.
  const { registroTurnoAtual } = await import("@/lib/nina/rastreio/turno.server");
  const turno = registroTurnoAtual();
  const execucaoId = turno?.execucaoId ?? null;
  const turnoId = args.turnoId ?? turno?.turnoId ?? null;

  const origemAviso: OrigemAviso = {
    clinicaId: args.clinicaId,
    ambiente,
    conversaId: args.conversaId,
    sessaoId: args.sessaoId ?? null,
    turnoId,
    protocolo: args.protocolo,
  };

  const {
    reservarEnvioAviso,
    confirmarEnvioAviso,
    registrarFalhaAviso,
    marcarResultadoIncerto,
    conferirAvisoJaEnviado,
    lerAviso,
    resultadoDoRegistro,
  } = await import("./aviso-encaminhamento.server");
  const { hashDoTexto } = await import("@/lib/nina/confidence/hash");

  const reserva = await reservarEnvioAviso({
    origem: origemAviso,
    protocolo: args.protocolo,
    texto,
    textoHash: hashDoTexto(texto),
    execucaoId,
    handoffEventoId: args.handoffEventoId ?? null,
    preparadoPor: args.userId ?? "sistema",
  });

  // Resultado incerto de uma tentativa anterior: conferir ANTES de repetir.
  if (reserva.decisao === "verificar_antes_de_reenviar") {
    const anterior = await conferirAvisoJaEnviado({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      texto,
    });
    if (anterior) {
      await confirmarEnvioAviso({
        chave: reserva.chave,
        mensagemId: anterior.mensagemId,
        transporte: ambiente === "homologacao" ? "test-console" : "whatsapp",
        transporteId: anterior.transporteId,
        protocolo: args.protocolo,
        texto,
      });
      const reg = resultadoDoRegistro(await lerAviso(reserva.chave), ambiente, true);
      return {
        ...vazio,
        informado: true,
        retry: true,
        mensagemId: anterior.mensagemId,
        mensagemTexto: texto,
        origem,
        setor,
        status: "sent",
        transporte: ambiente === "homologacao" ? "test-console" : "whatsapp",
        aviso: reg,
      };
    }
  }

  // Já entregue, entrega em andamento por outro caminho, ou tentativas
  // esgotadas: esta chamada NÃO produz mensagem nova.
  if (!reserva.reservado) {
    const reg = resultadoDoRegistro(reserva.registro, ambiente, true);
    return {
      ...vazio,
      informado: Boolean(reg?.entregue),
      retry: true,
      mensagemId: reg?.mensagemId ?? null,
      mensagemTexto: texto,
      origem,
      setor,
      status: reg?.entregue ? "sent" : "nao_enviado",
      transporte: reg?.entregue
        ? ambiente === "homologacao"
          ? "test-console"
          : "whatsapp"
        : "nenhum",
      aviso: reg,
    };
  }

  let envio: ResultadoEnvio;
  try {
    envio = await enviarTextoSistema(args.clinicaId, args.conversaId, texto, execucaoId);
  } catch (e) {
    // Exceção do transporte: o envio pode ter saído. Estado explícito.
    await marcarResultadoIncerto({ chave: reserva.chave, erro: String(e) });
    return { ...vazio, mensagemTexto: texto, origem, setor, status: "falhou" };
  }

  if (!envio.ok) {
    await registrarFalhaAviso({
      chave: reserva.chave,
      erro: `envio ${envio.status}`,
      transporte: envio.transporte,
    });
    return {
      ...vazio,
      mensagemTexto: texto,
      origem,
      status: envio.status,
      transporte: envio.transporte,
      setor,
      aviso: resultadoDoRegistro(await lerAviso(reserva.chave), ambiente, false),
    };
  }

  await confirmarEnvioAviso({
    chave: reserva.chave,
    mensagemId: envio.mensagemId,
    transporte: envio.transporte,
    transporteId: envio.transporteId,
    protocolo: args.protocolo,
    texto,
  });

  // FASE 6 — a mensagem do protocolo é saída CONTROLADA do sistema: entra na
  // auditoria com hash próprio e SEM herdar a nota da resposta candidata.
  try {
    const { registrarEntregaSaida } = await import("@/lib/nina/entrega-saida.server");
    const { gravarEntregaDoTurno } = await import("@/lib/nina/rastreio/turno.server");
    const estado = envio.transporteId ? "confirmada" : "persistida";
    await registrarEntregaSaida({
      clinicaId: args.clinicaId,
      decisaoId: null,
      vincularAvaliacao: false,
      execucaoId,
      conversaId: args.conversaId,
      outgoingMessageId: envio.mensagemId,
      representacao: "texto_completo",
      estado: envio.mensagemId ? estado : "falhou",
      textoHash: hashDoTexto(texto),
      transporteId: envio.transporteId,
      detalhe: {
        origem: "aviso_encaminhamento",
        protocolo: args.protocolo,
        transporte: envio.transporte,
        avaliada: false,
        chave_aviso: reserva.chave,
      },
    });
    await gravarEntregaDoTurno({
      clinicaId: args.clinicaId,
      turnoId: turno?.turnoId ?? null,
      execucaoId,
      conversaId: args.conversaId,
      outgoingMessageId: envio.mensagemId,
      canal: envio.transporte,
      textoHash: hashDoTexto(texto),
      estado: envio.mensagemId ? estado : "falhou",
      transporteId: envio.transporteId,
    });
    // RASTREABILIDADE do aviso do protocolo: origem, validação e a declaração
    // de que porcentagem de confiança NÃO se aplica a esta mensagem.
    const { registrarAvisoOperacional } = await import("@/lib/nina/rastreio/turno.server");
    registrarAvisoOperacional({
      origem: "atendimento_protocolo",
      tipo: "aviso_encaminhamento",
      motivo: `Encaminhamento para atendimento humano informado ao paciente (protocolo ${args.protocolo})`,
      validacao:
        ambiente === "homologacao"
          ? "encaminhamento_simulado"
          : envio.mensagemId
            ? "encaminhamento_confirmado"
            : "encaminhamento_falhou",
      protocolo: args.protocolo,
      mensagemId: envio.mensagemId ?? null,
      execucaoId: execucaoId ?? null,
      handoffEventoId: args.handoffEventoId ?? null,
      textoHash: hashDoTexto(texto),
    });
  } catch (e) {
    // Auditoria nunca desfaz encaminhamento nem segura a fila.
    console.error("[protocolo] falha ao vincular a mensagem de handoff", e);
  }

  const { registrarEvento } = await import("./handoff.server");
  await registrarEvento({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    evento: "ASSUMIDA",
    userId: args.userId ?? null,
    motivo: `Protocolo ${args.protocolo} informado ao paciente`,
    detalhes: {
      protocol_number: args.protocolo,
      protocolo_informado: true,
      mensagem_origem: origem,
      message_id: envio.mensagemId,
      transporte: envio.transporte,
      chave_aviso: reserva.chave,
    },
  });
  return {
    informado: true,
    mensagemId: envio.mensagemId,
    mensagemTexto: texto,
    origem,
    status: envio.status,
    transporte: envio.transporte,
    retry: false,
    setor,
    aviso: resultadoDoRegistro(await lerAviso(reserva.chave), ambiente, false),
  };
}


/**
 * Chamado quando a conversa passa efetivamente para uma pessoa.
 * Só vale para conversas que vieram da Nina (`handoff_em` preenchido) — uma
 * conversa que já nasceu humana não gera protocolo por atribuição.
 */
export async function protocoloAoAtribuirHumano(args: {
  clinicaId: string;
  conversaId: string;
  userId?: string | null;
}): Promise<ProtocoloGerado> {
  const conv = await lerConversa(args.clinicaId, args.conversaId);
  if (!conv || !conv.handoff_em) return null;

  const r = await garantirProtocoloAtendimento({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    gatilho: "transferencia",
    userId: args.userId ?? null,
  });
  if (!r) return r;

  // O anúncio pode já ter acontecido no início do handoff (Fase 3). Aqui ele
  // funciona como RETRY: mesmo protocolo, uma única comunicação lógica.
  await anunciarHandoffAoPaciente({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    protocolo: r.protocolo,
    userId: args.userId ?? null,
  });
  return r;
}

/** Nome do departamento cadastrado (setor estruturado) — nunca inventado. */
async function nomeDepartamento(clinicaId: string, departamentoId: string | null) {
  if (!departamentoId) return null;
  const { data } = await supabaseAdmin
    .from("atend_departamentos")
    .select("nome")
    .eq("id", departamentoId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return ((data as { nome?: string | null } | null)?.nome ?? null) as string | null;
}

/** Traduz o motivo registrado no handoff para o motivo funcional da mensagem. */
async function motivoDoHandoff(
  clinicaId: string,
  conversaId: string,
): Promise<MotivoHandoff> {
  const { data } = await supabaseAdmin
    .from("atend_conversa_eventos")
    .select("evento, motivo")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .eq("evento", "HANDOFF_SOLICITADO")
    .order("created_at", { ascending: false })
    .limit(1);
  const bruto = ((data as Array<{ motivo?: string | null }> | null)?.[0]?.motivo ?? "").toLowerCase();
  return classificarMotivoHandoff(bruto);
}
