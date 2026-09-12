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
import { ambienteDoHandoff, deveInformarProtocolo, vinculoProtocolo } from "./protocolo-handoff";
import { classificarMotivoHandoff, type MotivoHandoff } from "./mensagem-handoff";
import { nomeContato } from "./rotulo-conversa";
import type { StatusEnvioHandoff, TransporteHandoff } from "./handoff-auditoria";



export type ProtocoloGerado = { protocolo: string; novo: boolean } | null;

type LinhaConversa = {
  protocolo_atendimento: string | null;
  protocolo_sessao_id: string | null;
  handoff_em: string | null;
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
      "protocolo_atendimento, protocolo_sessao_id, handoff_em, contato_telefone, contato_nome, whatsapp_profile_name, departamento_id, is_teste, nina_fluxo_estado",
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
        });
  return { ...r, anuncio };
}


/** O paciente já recebeu este número neste atendimento? */
async function protocoloJaInformado(clinicaId: string, conversaId: string, protocolo: string) {
  const { data } = await supabaseAdmin
    .from("atend_conversa_eventos")
    .select("id, detalhes")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as Array<{ detalhes: unknown }>).some((e) => {
    const d = e.detalhes as { protocolo_informado?: unknown; protocol_number?: unknown } | null;
    return Boolean(d?.protocolo_informado) && d?.protocol_number === protocolo;
  });
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
};

async function enviarTextoSistema(
  clinicaId: string,
  conversaId: string,
  texto: string,
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
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[protocolo] falha ao registrar mensagem de teste", error.message);
      return { ok: false, mensagemId: null, status: "falhou", transporte: "test-console" };
    }
    return {
      ok: true,
      mensagemId: ((data as { id?: string } | null)?.id ?? null),
      status: "sent",
      transporte: "test-console",
    };
  }
  if (!conv || !conv.contato_telefone) {
    await registrarMarcadorSistema({ clinicaId, conversaId, texto });
    return { ok: true, mensagemId: null, status: "sent", transporte: "marcador_interno" };
  }
  try {
    const { loadWhatsAppConfig, metaSendText } = await import("@/lib/whatsapp.server");
    const cfg = await loadWhatsAppConfig(clinicaId);
    if (!cfg?.phone_number_id || !cfg.access_token) {
      await registrarMarcadorSistema({ clinicaId, conversaId, texto });
      return { ok: false, mensagemId: null, status: "nao_enviado", transporte: "marcador_interno" };
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
      })
      .select("id")
      .maybeSingle();
    return {
      ok: true,
      mensagemId: ((data as { id?: string } | null)?.id ?? null),
      status: "sent",
      transporte: "whatsapp",
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
    return { ok: false, mensagemId: null, status: "falhou", transporte: "whatsapp" };
  }
}


/**
 * FASE 3 — comunica ao paciente a transferência + o protocolo real.
 * Uma única comunicação lógica por atendimento: se já foi informada, sai.
 * Se o envio falhar, nada é marcado e a próxima tentativa reusa o protocolo.
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
};

export async function anunciarHandoffAoPaciente(args: {
  clinicaId: string;
  conversaId: string;
  protocolo: string;
  userId?: string | null;
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
  };
  const conv = await lerConversa(args.clinicaId, args.conversaId);
  if (!conv) return vazio;

  const setor = await nomeDepartamento(args.clinicaId, conv.departamento_id);
  const jaInformado = await protocoloJaInformado(
    args.clinicaId,
    args.conversaId,
    args.protocolo,
  );
  // Idempotência: o mesmo protocolo nunca é anunciado duas vezes.
  if (!deveInformarProtocolo({ protocolo: args.protocolo, jaInformado }))
    return { ...vazio, informado: jaInformado, retry: jaInformado, setor };

  const { gerarMensagemHandoff } = await import("./mensagem-handoff.server");
  // FASE 3 — o texto de transferência usa a MESMA identidade publicada do
  // atendimento; sem identidade válida ele fala de forma neutra.
  const { identidadeEfetivaAtual, identidadeParaMensagens } = await import(
    "@/lib/nina/identidade-efetiva.server"
  );
  const identidade = identidadeParaMensagens(await identidadeEfetivaAtual("whatsapp"));
  const { texto, origem } = await gerarMensagemHandoff({
    protocolo: args.protocolo,
    // Mesma identidade canônica do cabeçalho da conversa (FASE 2).
    nome: nomeContato(conv),
    setor,
    motivo: await motivoDoHandoff(args.clinicaId, args.conversaId),
    identidade,
  });

  const envio = await enviarTextoSistema(args.clinicaId, args.conversaId, texto);
  if (!envio.ok)
    return {
      ...vazio,
      mensagemTexto: texto,
      origem,
      status: envio.status,
      transporte: envio.transporte,
      setor,
    };

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

