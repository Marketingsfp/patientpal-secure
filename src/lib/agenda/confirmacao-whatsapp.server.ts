// Confirmação automática de consultas pelo WhatsApp oficial (Zap OS) — servidor.
//
// Três entradas:
//   • executarRodadaConfirmacao  — chamada pelo pg_cron a cada 10 min;
//   • processarRespostaConfirmacao — chamada pelo webhook ANTES da Nina;
//   • registrarStatusEntregaConfirmacao — recibos de entrega/leitura/falha.
//
// Travas que NÃO podem ser afrouxadas sem decisão do dono:
//   1. A resposta só altera o agendamento se ele ainda estiver "agendado" e no
//      mesmo horário do envio. Mudança manual da recepção sempre prevalece.
//   2. Cancelamento automático grava motivo; nunca mexe em pacote, em ficha
//      com pagamento registrado nem em atendimento externo — nesses casos a
//      resposta fica registrada para a equipe decidir.
//   3. "Confirmado" não é check-in; presença continua sendo clique manual.
//   4. A mensagem leva só primeiro nome, dia e hora — nada de médico/serviço.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import {
  loadWhatsAppConfig,
  metaCreateTemplate,
  metaListTemplates,
  metaSendTemplate,
  metaSendText,
} from "@/lib/whatsapp.server";
import {
  celularParaEnvio,
  chaveTelefone,
  dentroDaJanelaDeEnvio,
  etapaParaConsulta,
  interpretarResposta,
  lerPayloadBotao,
  parametrosTemplate,
  payloadBotao,
  somarDias,
  TEMPLATE_CONFIRMACAO,
  textoFechamento,
  type AcaoResposta,
  type EtapaConfirmacao,
} from "./confirmacao-whatsapp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export const MOTIVO_CANCELAMENTO_WHATSAPP =
  "Paciente cancelou pelo WhatsApp (resposta automática ao lembrete de consulta)";

type ConfigConfirmacao = {
  clinica_id: string;
  ativo: boolean;
  medico_ids: string[] | null;
  etapas: string[];
  hora_inicio: string;
  hora_fim: string;
  max_por_rodada: number;
  template_nome: string;
  template_idioma: string;
  template_status: string | null;
  template_verificado_em: string | null;
};

type LinhaConfirmacao = {
  id: string;
  clinica_id: string;
  agendamento_id: string;
  etapa: EtapaConfirmacao;
  agendamento_inicio: string;
  telefone: string | null;
  status: string;
  wa_message_id: string | null;
  enviado_em: string | null;
  resposta_wa_message_id?: string | null;
};

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

function mesmoInstante(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function erroTexto(e: unknown): string {
  return String(e instanceof Error ? e.message : e).slice(0, 500);
}

/* =========================================================================
 * Template na Meta
 * ========================================================================= */

export async function garantirTemplateConfirmacao(
  clinicaId: string,
  opcoes: { criarSeFaltar: boolean },
): Promise<{ status: string; criado: boolean; erro?: string }> {
  const db = await admin();
  const { data: conf } = await db
    .from("agendamento_confirmacao_config")
    .select("template_nome, template_idioma")
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  const nome =
    (conf as { template_nome?: string } | null)?.template_nome ?? "confirmacao_consulta_v1";
  const idioma = (conf as { template_idioma?: string } | null)?.template_idioma ?? "pt_BR";

  const cfg = await loadWhatsAppConfig(clinicaId);
  const registrar = async (status: string, erro: string | null) => {
    await db
      .from("agendamento_confirmacao_config")
      .update({
        template_status: status,
        template_erro: erro,
        template_verificado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("clinica_id", clinicaId);
  };
  if (!cfg?.waba_id || !cfg.access_token) {
    await registrar("SEM_CONFIGURACAO", "WABA ID ou Access Token ausente");
    return { status: "SEM_CONFIGURACAO", criado: false, erro: "WhatsApp sem WABA/token" };
  }

  try {
    const templates = await metaListTemplates(cfg.waba_id, cfg.access_token);
    const existente = templates.find((t) => t.name === nome && t.language === idioma);
    if (existente) {
      await registrar(existente.status, existente.rejected_reason ?? null);
      return { status: existente.status, criado: false };
    }
    if (!opcoes.criarSeFaltar) {
      await registrar("NAO_SUBMETIDO", null);
      return { status: "NAO_SUBMETIDO", criado: false };
    }
    const res = await metaCreateTemplate(cfg.waba_id, cfg.access_token, {
      name: nome,
      language: idioma,
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text: TEMPLATE_CONFIRMACAO.corpo,
          example: { body_text: [[...TEMPLATE_CONFIRMACAO.exemplo]] },
        },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: TEMPLATE_CONFIRMACAO.botaoConfirmar },
            { type: "QUICK_REPLY", text: TEMPLATE_CONFIRMACAO.botaoCancelar },
          ],
        },
      ],
    });
    await registrar(res.status ?? "PENDING", null);
    return { status: res.status ?? "PENDING", criado: true };
  } catch (e) {
    const erro = erroTexto(e);
    await registrar("ERRO", erro);
    return { status: "ERRO", criado: false, erro };
  }
}

/* =========================================================================
 * Rodada de envio (cron)
 * ========================================================================= */

export type ResumoRodada = {
  clinica_id: string;
  pulado?: string;
  enviados: number;
  sem_telefone: number;
  falhas: number;
  expirados: number;
};

export async function executarRodadaConfirmacao(agora: Date = new Date()): Promise<ResumoRodada[]> {
  const db = await admin();
  const { data: configs, error } = await db
    .from("agendamento_confirmacao_config")
    .select("*")
    .eq("ativo", true);
  if (error) throw new Error(error.message);

  const resumos: ResumoRodada[] = [];
  for (const conf of (configs ?? []) as ConfigConfirmacao[]) {
    const resumo: ResumoRodada = {
      clinica_id: conf.clinica_id,
      enviados: 0,
      sem_telefone: 0,
      falhas: 0,
      expirados: 0,
    };
    try {
      await rodadaDaClinica(db, conf, agora, resumo);
    } catch (e) {
      resumo.pulado = `erro: ${erroTexto(e)}`;
    }
    await db
      .from("agendamento_confirmacao_config")
      .update({ ultima_rodada_em: agora.toISOString(), ultima_rodada_resumo: resumo })
      .eq("clinica_id", conf.clinica_id);
    resumos.push(resumo);
  }
  return resumos;
}

async function rodadaDaClinica(
  db: Db,
  conf: ConfigConfirmacao,
  agora: Date,
  resumo: ResumoRodada,
): Promise<void> {
  const agoraIso = agora.toISOString();

  // Manutenção: reserva que ficou presa (servidor caiu no meio) NÃO é
  // reenviada — não dá para saber se a Meta entregou. Vira falha visível.
  const quinzeMin = new Date(agora.getTime() - 15 * 60_000).toISOString();
  await db
    .from("agendamento_confirmacoes")
    .update({
      status: "falha",
      erro: "Resultado do envio incerto; não reenviado",
      updated_at: agoraIso,
    })
    .eq("clinica_id", conf.clinica_id)
    .eq("status", "reservado")
    .lt("created_at", quinzeMin);
  const { data: vencidos } = await db
    .from("agendamento_confirmacoes")
    .update({ status: "expirado", updated_at: agoraIso })
    .eq("clinica_id", conf.clinica_id)
    .eq("status", "enviado")
    .lt("agendamento_inicio", agoraIso)
    .select("id");
  resumo.expirados = (vencidos ?? []).length;

  if (!dentroDaJanelaDeEnvio(conf.hora_inicio, conf.hora_fim, agora)) {
    resumo.pulado = "fora do horário de envio";
    return;
  }

  // Template: confere o status na Meta no máximo a cada 30 min enquanto não
  // estiver aprovado. Sem aprovação, nada sai.
  let templateStatus = conf.template_status;
  const verificadoHa = conf.template_verificado_em
    ? agora.getTime() - new Date(conf.template_verificado_em).getTime()
    : Infinity;
  if (templateStatus !== "APPROVED" && verificadoHa > 30 * 60_000) {
    templateStatus = (await garantirTemplateConfirmacao(conf.clinica_id, { criarSeFaltar: false }))
      .status;
  }
  if (templateStatus !== "APPROVED") {
    resumo.pulado = `template ${templateStatus ?? "não verificado"}`;
    return;
  }

  const cfg = await loadWhatsAppConfig(conf.clinica_id);
  if (!cfg?.ativo || !cfg.phone_number_id || !cfg.access_token) {
    resumo.pulado = "WhatsApp da clínica inativo ou sem credenciais";
    return;
  }

  const hoje = hojeBR();
  const inicioJanela = janelaDiaClinica(somarDias(hoje, 1)).inicio;
  const fimJanela = janelaDiaClinica(somarDias(hoje, 2)).fimExclusivo;

  let q = db
    .from("agendamentos")
    .select(
      "id, paciente_id, paciente_nome, medico_id, agenda_id, inicio, status, origem_externa, is_mock_data",
    )
    .eq("clinica_id", conf.clinica_id)
    .eq("status", "agendado")
    .not("paciente_id", "is", null)
    .gte("inicio", inicioJanela)
    .lt("inicio", fimJanela)
    .order("inicio", { ascending: true });
  if (conf.medico_ids && conf.medico_ids.length > 0) q = q.in("medico_id", conf.medico_ids);
  const { data: ags, error: eAg } = await q.range(0, 2999);
  if (eAg) throw new Error(eAg.message);

  type Ag = {
    id: string;
    paciente_id: string;
    paciente_nome: string;
    medico_id: string | null;
    agenda_id: string | null;
    inicio: string;
    origem_externa: boolean | null;
    is_mock_data: boolean | null;
  };
  const candidatos = ((ags ?? []) as Ag[])
    .filter((a) => !a.origem_externa && !a.is_mock_data)
    .map((a) => ({ ag: a, etapa: etapaParaConsulta(a.inicio, hoje, conf.etapas) }))
    .filter((x): x is { ag: Ag; etapa: EtapaConfirmacao } => x.etapa !== null);
  if (candidatos.length === 0) return;

  // O que já existe para esses agendamentos (em lotes, para não estourar a URL).
  const ids = candidatos.map((c) => c.ag.id);
  const existentes: Array<{ agendamento_id: string; etapa: string; status: string }> = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db
      .from("agendamento_confirmacoes")
      .select("agendamento_id, etapa, status")
      .in("agendamento_id", ids.slice(i, i + 150));
    existentes.push(...((data ?? []) as typeof existentes));
  }
  const RESPONDIDO = new Set(["confirmado", "cancelado", "sem_efeito"]);
  const jaTem = new Set(existentes.map((e) => `${e.agendamento_id}|${e.etapa}`));
  const respondido = new Set(
    existentes.filter((e) => RESPONDIDO.has(e.status)).map((e) => e.agendamento_id),
  );
  const fila = candidatos
    .filter((c) => !jaTem.has(`${c.ag.id}|${c.etapa}`) && !respondido.has(c.ag.id))
    .slice(0, conf.max_por_rodada);
  if (fila.length === 0) return;

  const pacienteIds = [...new Set(fila.map((c) => c.ag.paciente_id))];
  const { data: pacs } = await db
    .from("pacientes")
    .select("id, telefone, telefone2")
    .in("id", pacienteIds);
  const telefones = new Map(
    ((pacs ?? []) as Array<{ id: string; telefone: string | null; telefone2: string | null }>).map(
      (p) => [p.id, celularParaEnvio(p.telefone) ?? celularParaEnvio(p.telefone2)],
    ),
  );
  const agendaIds = [...new Set(fila.map((c) => c.ag.agenda_id).filter(Boolean))] as string[];
  const ordemChegada = new Set<string>();
  if (agendaIds.length > 0) {
    const { data: agendas } = await db
      .from("medico_agendas")
      .select("id, ordem_chegada")
      .in("id", agendaIds);
    for (const a of (agendas ?? []) as Array<{ id: string; ordem_chegada: boolean | null }>) {
      if (a.ordem_chegada) ordemChegada.add(a.id);
    }
  }

  for (const { ag, etapa } of fila) {
    const telefone = telefones.get(ag.paciente_id) ?? null;
    // Reserva idempotente: a UNIQUE (agendamento_id, etapa) garante que duas
    // rodadas simultâneas nunca mandem a mesma mensagem duas vezes.
    const { data: reserva } = await db
      .from("agendamento_confirmacoes")
      .upsert(
        {
          clinica_id: conf.clinica_id,
          agendamento_id: ag.id,
          paciente_id: ag.paciente_id,
          medico_id: ag.medico_id,
          etapa,
          agendamento_inicio: ag.inicio,
          telefone,
          telefone_chave: chaveTelefone(telefone),
          status: telefone ? "reservado" : "sem_telefone",
          template_nome: conf.template_nome,
        },
        { onConflict: "agendamento_id,etapa", ignoreDuplicates: true },
      )
      .select("id");
    const reservaId = ((reserva ?? []) as Array<{ id: string }>)[0]?.id;
    if (!reservaId) continue; // outra rodada pegou
    if (!telefone) {
      resumo.sem_telefone++;
      continue;
    }

    const params = parametrosTemplate({
      pacienteNome: ag.paciente_nome,
      inicio: ag.inicio,
      ordemChegada: ag.agenda_id ? ordemChegada.has(ag.agenda_id) : false,
    });
    try {
      const { wa_message_id } = await metaSendTemplate(
        cfg.phone_number_id,
        cfg.access_token,
        telefone,
        conf.template_nome,
        conf.template_idioma,
        params,
        [payloadBotao(reservaId, "confirmar"), payloadBotao(reservaId, "cancelar")],
      );
      const enviadoEm = new Date().toISOString();
      await db
        .from("agendamento_confirmacoes")
        .update({ status: "enviado", wa_message_id, enviado_em: enviadoEm, updated_at: enviadoEm })
        .eq("id", reservaId);
      await db.from("whatsapp_mensagens").insert({
        clinica_id: conf.clinica_id,
        wa_message_id,
        direction: "out",
        from_number: cfg.display_phone_number,
        to_number: telefone,
        body: TEMPLATE_CONFIRMACAO.corpo
          .replace("{{1}}", params[0])
          .replace("{{2}}", params[1])
          .replace("{{3}}", params[2]),
        tipo: "template",
        status: "sent",
        enviada_por: "sistema",
      });
      resumo.enviados++;
    } catch (e) {
      resumo.falhas++;
      await db
        .from("agendamento_confirmacoes")
        .update({ status: "falha", erro: erroTexto(e), updated_at: new Date().toISOString() })
        .eq("id", reservaId);
    }
  }
}

/* =========================================================================
 * Resposta do paciente (webhook)
 * ========================================================================= */

export type ResultadoRespostaConfirmacao = {
  tratada: boolean;
  resposta?: string;
  confirmacaoId?: string;
  resultado?: string;
};

/** Extrai o que interessa de uma mensagem crua da Meta. */
export function extrairRespostaDaMensagem(
  msg: Record<string, unknown>,
  textoPaciente: string,
): { payload: string | null; contextId: string | null; texto: string } {
  const m = msg as {
    type?: string;
    button?: { payload?: string; text?: string };
    interactive?: { button_reply?: { id?: string; title?: string } };
    context?: { id?: string };
  };
  const payload = m.button?.payload ?? m.interactive?.button_reply?.id ?? null;
  const texto = m.button?.text ?? m.interactive?.button_reply?.title ?? textoPaciente ?? "";
  return { payload, contextId: m.context?.id ?? null, texto };
}

export async function processarRespostaConfirmacao(params: {
  clinicaId: string;
  from: string;
  waMessageId: string;
  msg: Record<string, unknown>;
  textoPaciente: string;
}): Promise<ResultadoRespostaConfirmacao> {
  const db = await admin();
  const { payload, contextId, texto } = extrairRespostaDaMensagem(params.msg, params.textoPaciente);
  const chave = chaveTelefone(params.from);
  if (!chave) return { tratada: false };

  const colunas =
    "id, clinica_id, agendamento_id, etapa, agendamento_inicio, telefone, status, wa_message_id, enviado_em, resposta_wa_message_id";
  let linha: LinhaConfirmacao | null = null;
  let acao: AcaoResposta | null = null;

  // 1) Botão com payload: casamento exato com o lembrete.
  const lido = lerPayloadBotao(payload);
  if (lido) {
    const { data } = await db
      .from("agendamento_confirmacoes")
      .select(colunas)
      .eq("id", lido.confirmacaoId)
      .eq("clinica_id", params.clinicaId)
      .maybeSingle();
    linha = data as LinhaConfirmacao | null;
    acao = lido.acao;
  }

  // 2) Resposta citando o lembrete (context.id) ou botão sem payload.
  if (!linha && contextId) {
    const acaoTexto = interpretarResposta(texto);
    if (acaoTexto) {
      const { data } = await db
        .from("agendamento_confirmacoes")
        .select(colunas)
        .eq("clinica_id", params.clinicaId)
        .eq("wa_message_id", contextId)
        .maybeSingle();
      linha = data as LinhaConfirmacao | null;
      acao = acaoTexto;
    }
  }

  // 3) "1"/"2" digitado solto: só vale com UMA pendência para o telefone e se
  //    ninguém (Nina/atendente) falou com o paciente depois do lembrete.
  if (!linha && !lido) {
    const acaoTexto = interpretarResposta(texto);
    if (!acaoTexto) return { tratada: false };
    const { data } = await db
      .from("agendamento_confirmacoes")
      .select(colunas)
      .eq("clinica_id", params.clinicaId)
      .eq("telefone_chave", chave)
      .eq("status", "enviado")
      .gt("agendamento_inicio", new Date().toISOString())
      .order("enviado_em", { ascending: false })
      .limit(5);
    const pendentes = (data ?? []) as LinhaConfirmacao[];
    const porAgendamento = new Map(pendentes.map((p) => [p.agendamento_id, p]));
    if (porAgendamento.size !== 1) return { tratada: false };
    const unica = pendentes[0]!;
    const ultimos8 = chave.slice(-8);
    const { count } = await db
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", params.clinicaId)
      .eq("direction", "out")
      .like("to_number", `%${ultimos8}`)
      .gt("created_at", unica.enviado_em ?? new Date(0).toISOString())
      .neq("wa_message_id", unica.wa_message_id ?? "");
    if ((count ?? 0) > 0) return { tratada: false };
    linha = unica;
    acao = acaoTexto;
  }

  if (!linha || !acao) return { tratada: false };
  if (chaveTelefone(linha.telefone) !== chave) return { tratada: false };

  return aplicarResposta(db, linha, acao, {
    texto,
    waMessageId: params.waMessageId,
    from: params.from,
  });
}

async function aplicarResposta(
  db: Db,
  linha: LinhaConfirmacao,
  acao: AcaoResposta,
  entrada: { texto: string; waMessageId: string; from: string },
): Promise<ResultadoRespostaConfirmacao> {
  const agoraIso = new Date().toISOString();
  const base = {
    resposta_acao: acao,
    resposta_texto: entrada.texto.slice(0, 200),
    resposta_wa_message_id: entrada.waMessageId,
    respondido_em: agoraIso,
    updated_at: agoraIso,
  };

  // Resposta repetida (clicou duas vezes / respondeu 48h e 24h): não altera
  // nada de novo, só confirma ao paciente o que já foi registrado.
  // Reentrega do MESMO evento pela Meta: já foi tratado, não responde de novo.
  if (linha.resposta_wa_message_id && linha.resposta_wa_message_id === entrada.waMessageId) {
    return { tratada: true, confirmacaoId: linha.id, resultado: "reentrega_ignorada" };
  }
  if (linha.status === "expirado") {
    // Respondeu no lembrete antigo depois de já ter respondido no outro.
    const { data: irma } = await db
      .from("agendamento_confirmacoes")
      .select(
        "id, clinica_id, agendamento_id, etapa, agendamento_inicio, telefone, status, wa_message_id, enviado_em, resposta_wa_message_id",
      )
      .eq("agendamento_id", linha.agendamento_id)
      .in("status", ["confirmado", "cancelado", "sem_efeito", "enviado"])
      .neq("id", linha.id)
      .maybeSingle();
    if (!irma) return { tratada: false };
    return aplicarResposta(db, irma as LinhaConfirmacao, acao, entrada);
  }
  if (linha.status !== "enviado") {
    const jaRegistrado =
      linha.status === "confirmado" ||
      linha.status === "cancelado" ||
      linha.status === "sem_efeito";
    if (!jaRegistrado) return { tratada: false };
    const resultado =
      linha.status === "cancelado"
        ? "ja_cancelado"
        : linha.status === "confirmado"
          ? "confirmado"
          : "sem_efeito";
    return {
      tratada: true,
      confirmacaoId: linha.id,
      resultado: `repetida_${linha.status}`,
      resposta: textoFechamento(resultado, { inicio: linha.agendamento_inicio }),
    };
  }

  // Trava de processamento único.
  const { data: claim } = await db
    .from("agendamento_confirmacoes")
    .update({ status: "processando", updated_at: agoraIso })
    .eq("id", linha.id)
    .eq("status", "enviado")
    .select("id");
  if (((claim ?? []) as unknown[]).length === 0) return { tratada: false };

  const finalizar = async (
    status: "confirmado" | "cancelado" | "sem_efeito",
    observacao: string | null,
  ) => {
    await db
      .from("agendamento_confirmacoes")
      .update({ ...base, status, observacao })
      .eq("id", linha.id);
    // A outra etapa do mesmo agendamento, se ainda aberta, deixa de valer.
    await db
      .from("agendamento_confirmacoes")
      .update({ status: "expirado", updated_at: agoraIso })
      .eq("agendamento_id", linha.agendamento_id)
      .eq("status", "enviado")
      .neq("id", linha.id);
  };

  try {
    const { data: agRaw } = await db
      .from("agendamentos")
      .select("id, status, inicio, pacote_id, orcamento_id, origem_externa, data_pagamento")
      .eq("id", linha.agendamento_id)
      .maybeSingle();
    const ag = agRaw as {
      id: string;
      status: string;
      inicio: string;
      pacote_id: string | null;
      orcamento_id: string | null;
      origem_externa: boolean | null;
      data_pagamento: string | null;
    } | null;

    const semEfeito = async (observacao: string) => {
      await finalizar("sem_efeito", observacao);
      return {
        tratada: true,
        confirmacaoId: linha.id,
        resultado: `sem_efeito: ${observacao}`,
        resposta: textoFechamento(ag?.status === "cancelado" ? "ja_cancelado" : "sem_efeito", {
          inicio: linha.agendamento_inicio,
        }),
      };
    };

    if (!ag) return await semEfeito("agendamento não existe mais");
    if (!mesmoInstante(ag.inicio, linha.agendamento_inicio)) {
      return await semEfeito("horário alterado depois do lembrete");
    }

    if (acao === "confirmar") {
      if (ag.status === "confirmado") {
        await finalizar("confirmado", "já estava confirmado");
      } else if (ag.status === "agendado") {
        const { data: upd } = await db
          .from("agendamentos")
          .update({ status: "confirmado" })
          .eq("id", ag.id)
          .eq("status", "agendado")
          .eq("inicio", ag.inicio)
          .select("id");
        if (((upd ?? []) as unknown[]).length === 0) {
          return await semEfeito("situação alterada pela equipe");
        }
        await finalizar("confirmado", null);
      } else {
        return await semEfeito(`situação atual: ${ag.status}`);
      }
      return {
        tratada: true,
        confirmacaoId: linha.id,
        resultado: "confirmado",
        resposta: textoFechamento("confirmado", { inicio: ag.inicio }),
      };
    }

    // acao === "cancelar"
    if (ag.status === "cancelado") {
      await finalizar("cancelado", "já estava cancelado");
      return {
        tratada: true,
        confirmacaoId: linha.id,
        resultado: "ja_cancelado",
        resposta: textoFechamento("ja_cancelado", { inicio: ag.inicio }),
      };
    }
    if (ag.status !== "agendado") return await semEfeito(`situação atual: ${ag.status}`);
    if (ag.pacote_id) return await semEfeito("faz parte de pacote");
    if (ag.origem_externa) return await semEfeito("atendimento externo");
    if (ag.data_pagamento) return await semEfeito("já tem pagamento registrado");
    const { count: pagos } = await db
      .from("fin_lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("agendamento_id", ag.id)
      .eq("tipo", "receita")
      .eq("status", "confirmado");
    if ((pagos ?? 0) > 0) return await semEfeito("já tem pagamento registrado");

    const payload: Record<string, unknown> = {
      status: "cancelado",
      cancelamento_motivo: MOTIVO_CANCELAMENTO_WHATSAPP,
      cancelamento_em: agoraIso,
      cancelamento_por: null,
    };
    if (ag.orcamento_id) payload.orcamento_id = null;
    const { data: upd } = await db
      .from("agendamentos")
      .update(payload)
      .eq("id", ag.id)
      .eq("status", "agendado")
      .eq("inicio", ag.inicio)
      .select("id");
    if (((upd ?? []) as unknown[]).length === 0) {
      return await semEfeito("situação alterada pela equipe");
    }
    await finalizar("cancelado", null);
    return {
      tratada: true,
      confirmacaoId: linha.id,
      resultado: "cancelado",
      resposta: textoFechamento("cancelado", { inicio: ag.inicio }),
    };
  } catch (e) {
    // Devolve a pendência para "enviado": uma nova resposta pode ser tentada,
    // e a mensagem segue para o atendimento normal em vez de sumir.
    await db
      .from("agendamento_confirmacoes")
      .update({ status: "enviado", erro: erroTexto(e), updated_at: new Date().toISOString() })
      .eq("id", linha.id)
      .eq("status", "processando");
    return { tratada: false };
  }
}

/** Envia a mensagem de fechamento e registra no histórico do WhatsApp. */
export async function enviarFechamentoConfirmacao(params: {
  clinicaId: string;
  confirmacaoId: string | undefined;
  phoneNumberId: string;
  accessToken: string;
  displayPhoneNumber: string | null;
  to: string;
  texto: string;
}): Promise<void> {
  const db = await admin();
  const { wa_message_id } = await metaSendText(
    params.phoneNumberId,
    params.accessToken,
    params.to,
    params.texto,
  );
  await db.from("whatsapp_mensagens").insert({
    clinica_id: params.clinicaId,
    wa_message_id,
    direction: "out",
    from_number: params.displayPhoneNumber,
    to_number: params.to,
    body: params.texto,
    tipo: "text",
    status: "sent",
    enviada_por: "sistema",
  });
  if (params.confirmacaoId && wa_message_id) {
    await db
      .from("agendamento_confirmacoes")
      .update({ fechamento_wa_message_id: wa_message_id })
      .eq("id", params.confirmacaoId);
  }
}

/* =========================================================================
 * Recibos de entrega (statuses do webhook)
 * ========================================================================= */

export async function registrarStatusEntregaConfirmacao(
  clinicaId: string,
  statuses: Array<Record<string, unknown>>,
): Promise<void> {
  if (statuses.length === 0) return;
  const db = await admin();
  for (const s of statuses) {
    const st = s as {
      id?: string;
      status?: string;
      timestamp?: string;
      errors?: Array<{ title?: string; message?: string; code?: number }>;
    };
    if (!st.id || !st.status) continue;
    const quando = st.timestamp
      ? new Date(Number(st.timestamp) * 1000).toISOString()
      : new Date().toISOString();
    if (st.status === "delivered") {
      await db
        .from("agendamento_confirmacoes")
        .update({ entregue_em: quando })
        .eq("clinica_id", clinicaId)
        .eq("wa_message_id", st.id)
        .is("entregue_em", null);
    } else if (st.status === "read") {
      await db
        .from("agendamento_confirmacoes")
        .update({ lido_em: quando })
        .eq("clinica_id", clinicaId)
        .eq("wa_message_id", st.id)
        .is("lido_em", null);
    } else if (st.status === "failed") {
      const e = st.errors?.[0];
      await db
        .from("agendamento_confirmacoes")
        .update({
          status: "falha",
          erro: `${e?.code ?? ""} ${e?.title ?? e?.message ?? "falha na entrega"}`
            .trim()
            .slice(0, 500),
          observacao: "WhatsApp não entregou",
          updated_at: new Date().toISOString(),
        })
        .eq("clinica_id", clinicaId)
        .eq("wa_message_id", st.id)
        .eq("status", "enviado");
    }
  }
}
