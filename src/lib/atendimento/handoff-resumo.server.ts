/**
 * Geração do resumo automático da Nina no handoff (server-only).
 *
 * Fluxo:
 *  1. No momento da transferência, `reservarResumoHandoff` cria a linha
 *     (status "gerando"). É idempotente por (conversa, handoff_em): reabrir a
 *     tela, reprocessar o webhook ou duas abas abertas não geram dois resumos.
 *  2. `garantirResumoHandoff` produz o conteúdo a partir das mensagens reais e
 *     grava o resultado. Falha de IA marca "erro" e permite nova tentativa —
 *     nunca bloqueia a transferência nem a fila.
 *
 * O resumo é INTERNO: não é enviado à Meta e não vira mensagem do paciente.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PROMPT_RESUMO_HANDOFF,
  normalizarResumo,
  type AgendamentoConfirmado,
  type ResumoHandoff,
} from "./handoff-resumo";
import {
  ajustarResumoPorDesfecho,
  ROTULO_DESFECHO,
  type DesfechoConversa,
  type SituacaoResumo,
} from "./resumo-desfecho";
import { registrarEvento } from "./handoff.server";
import {
  limiteTranscricaoResumo,
  montarPainelResumo,
  resumoNoPrazo,
  RETENCAO_RESUMO_MS,
  type PainelResumo,
} from "./resumo-retencao";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const TABELA = "atend_handoff_resumos";

export type StatusResumo = "gerando" | "ok" | "erro";

export interface LinhaResumo {
  id: string;
  conversa_id: string;
  versao: number;
  handoff_em: string;
  atendimento_inicio: string;
  motivo: string | null;
  status: StatusResumo;
  payload: ResumoHandoff | null;
  erro: string | null;
  situacao: SituacaoResumo;
  desfecho: DesfechoConversa | null;
  resolvido_em: string | null;
  resolvido_por: string | null;
  created_at: string;
  updated_at: string;
}

/** Marca os resumos vigentes desta conversa como superados/arquivados. */
export async function superarResumos(
  clinicaId: string,
  conversaId: string,
  situacao: "superseded" | "archived" = "superseded",
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABELA as never)
    .update({ situacao } as never)
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .eq("situacao", "active");
  if (error) console.error("[handoff-resumo] falha ao superar", error.message);
}

/** Reabertura: o resumo do ciclo anterior deixa de valer como situação atual. */
export async function arquivarResumosConversa(
  clinicaId: string,
  conversaId: string,
): Promise<void> {
  await superarResumos(clinicaId, conversaId, "archived");
}

/** Reserva a linha do resumo desta transferência (idempotente). */
export async function reservarResumoHandoff(args: {
  clinicaId: string;
  conversaId: string;
  handoffEm: string;
  motivo?: string | null;
  desfecho?: DesfechoConversa;
  resolvidoPor?: string | null;
}): Promise<void> {
  if (!resumoNoPrazo(args.handoffEm)) return;
  const { error } = await supabaseAdmin.rpc("atend_reservar_resumo", {
    _clinica_id: args.clinicaId,
    _conversa_id: args.conversaId,
    _handoff_em: args.handoffEm,
    _motivo: args.motivo ?? null,
    _desfecho: args.desfecho ?? "handoff_humano",
    _resolvido_por: args.resolvidoPor ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Registra um desfecho relevante: supera o resumo anterior, abre uma versão
 * nova e gera o conteúdo já coerente com o estado final. Nunca lança.
 */
export async function registrarDesfechoResumo(args: {
  clinicaId: string;
  conversaId: string;
  desfecho: DesfechoConversa;
  motivo?: string | null;
  resolvidoPor?: string | null;
}): Promise<LinhaResumo | null> {
  try {
    const agora = new Date().toISOString();
    await reservarResumoHandoff({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      handoffEm: agora,
      motivo: args.motivo ?? null,
      desfecho: args.desfecho,
      resolvidoPor: args.resolvidoPor ?? null,
    });
    if (args.resolvidoPor || args.desfecho === "conversa_resolvida") {
      await supabaseAdmin
        .from(TABELA as never)
        .update({ resolvido_em: agora, resolvido_por: args.resolvidoPor ?? null } as never)
        .eq("conversa_id", args.conversaId)
        .eq("handoff_em", agora);
    }
    return await garantirResumoHandoff({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      forcar: true,
      ignorarHandoff: true,
    });
  } catch (e) {
    console.error("[handoff-resumo] falha ao registrar desfecho", e);
    return null;
  }
}

/** Resumo VIGENTE da conversa (o que o card do chat mostra). */
async function ultimaLinha(clinicaId: string, conversaId: string): Promise<LinhaResumo | null> {
  const { data: ativo } = await supabaseAdmin
    .from(TABELA as never)
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .eq("situacao", "active")
    .gt("handoff_em", new Date(Date.now() - RETENCAO_RESUMO_MS).toISOString())
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (ativo as LinhaResumo | null) ?? null;
}

/** Agendamento REAL do paciente ligado a esta conversa (nunca inferido pela IA). */
async function agendamentoReal(
  clinicaId: string,
  pacienteId: string | null,
  inicio: string,
  agendamentoId: string | null,
): Promise<AgendamentoConfirmado | null> {
  if (!pacienteId) return null;
  let consulta = supabaseAdmin
    .from("agendamentos")
    .select("inicio, procedimento, tipo_atendimento, medicos(nome)")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .in("status", ["agendado", "confirmado"])
    .gte("inicio", new Date().toISOString());
  // Uma vaga pode ter sido criada antes do atendimento e reservada agora.
  consulta = agendamentoId ? consulta.eq("id", agendamentoId) : consulta.gte("created_at", inicio);
  const { data } = await consulta.order("inicio", { ascending: true }).limit(1).maybeSingle();
  const row = data as {
    inicio?: string;
    procedimento?: string | null;
    tipo_atendimento?: string | null;
    medicos?: { nome?: string } | null;
  } | null;
  if (!row?.inicio) return null;
  const d = new Date(row.inicio);
  return {
    medico: row.medicos?.nome ?? null,
    servico: row.procedimento ?? row.tipo_atendimento ?? null,
    data: d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    hora: d.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

async function transcricao(clinicaId: string, conversaId: string, inicio: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("whatsapp_mensagens")
    .select("id, body, direction, enviada_por, recebida_em, created_at, tipo")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .gte("created_at", limiteTranscricaoResumo(inicio))
    .order("recebida_em", { ascending: false })
    .limit(60);
  const mensagens = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((m) => m.enviada_por !== "sistema")
    .reverse();
  // A mensagem que abre o ciclo pode ter sido gravada antes de a Nina registrar
  // session_started_at. Inclui essa entrada, sem atravessar o encerramento anterior.
  if ((data?.length ?? 0) < 60 && mensagens[0]?.direction !== "in") {
    const { data: encerramento } = await supabaseAdmin
      .from("atend_conversa_eventos")
      .select("created_at")
      .eq("clinica_id", clinicaId)
      .eq("conversa_id", conversaId)
      .in("evento", ["FINALIZADA", "IA_MEMORIA_RESETADA"])
      .lt("created_at", inicio)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let entrada = supabaseAdmin
      .from("whatsapp_mensagens")
      .select("id, body, direction, enviada_por, recebida_em, created_at, tipo")
      .eq("clinica_id", clinicaId)
      .eq("conversa_id", conversaId)
      .eq("direction", "in")
      .gte("created_at", new Date(Date.now() - RETENCAO_RESUMO_MS).toISOString())
      .lte("created_at", inicio);
    if (encerramento) entrada = entrada.gt("created_at", encerramento.created_at);
    const { data: primeira } = await entrada
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (primeira && !mensagens.some((m) => m.id === primeira.id)) mensagens.unshift(primeira);
  }
  const linhas = mensagens.map((m) => {
    const quem =
      m.direction === "in" ? "Paciente" : m.enviada_por === "humano" ? "Atendente" : "Nina";
    const txt = String(m.body ?? "").trim() || `[${String(m.tipo ?? "mídia")}]`;
    return `[${String(m.recebida_em ?? m.created_at)}] ${quem}: ${txt.slice(0, 700)}`;
  });
  return linhas.join("\n").slice(-12_000);
}

async function chamarModelo(prompt: string): Promise<unknown> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT_RESUMO_HANDOFF },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados.");
    throw new Error(`Falha ao gerar resumo (${res.status}) ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const ini = raw.indexOf("{");
  const fim = raw.lastIndexOf("}");
  if (ini < 0 || fim < 0) throw new Error("Resposta da IA fora do formato esperado");
  return JSON.parse(raw.slice(ini, fim + 1));
}

/**
 * Devolve o resumo VIGENTE da conversa, gerando-o quando ainda não existe (ou
 * quando `forcar` pede nova tentativa). Nunca lança: erro vira status.
 */
export async function garantirResumoHandoff(args: {
  clinicaId: string;
  conversaId: string;
  forcar?: boolean;
  /** Desfecho já teve a linha reservada por `registrarDesfechoResumo`. */
  ignorarHandoff?: boolean;
  /** Contexto real do fluxo (não vem da IA): última pergunta, etapa, pendências. */
  extras?: {
    ultimaPergunta?: string | null;
    etapaInterrompida?: string | null;
    pendenciasExtras?: string[];
    informacoesExtras?: string[];
  };
}): Promise<LinhaResumo | null> {
  const { clinicaId, conversaId } = args;
  const { data: convData } = await supabaseAdmin
    .from("atend_conversas")
    .select(
      "handoff_em, handoff_motivo, contato_paciente_id, contato_nome, protocolo_atendimento, nina_fluxo_estado",
    )
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  const conv = convData as {
    handoff_em?: string | null;
    handoff_motivo?: string | null;
    contato_paciente_id?: string | null;
    contato_nome?: string | null;
    protocolo_atendimento?: string | null;
    nina_fluxo_estado?: { appointment?: { appointment_id?: string | null } } | null;
  } | null;
  if (!conv) return null;
  if (!conv.handoff_em && !args.ignorarHandoff) return null; // nunca passou por handoff

  if (conv.handoff_em && !args.ignorarHandoff) {
    await reservarResumoHandoff({
      clinicaId,
      conversaId,
      handoffEm: conv.handoff_em,
      motivo: conv.handoff_motivo ?? null,
    });
  }

  let linha = await ultimaLinha(clinicaId, conversaId);
  if (!linha || !resumoNoPrazo(linha.handoff_em)) return null;
  const inicioAtual = await inicioAtendimento(clinicaId, conversaId);
  if (!inicioAtual || Date.parse(linha.atendimento_inicio) !== Date.parse(inicioAtual)) return null;
  if (linha.status === "ok" && !args.forcar) return linha;

  // FASE 4 — trava de geração na ORIGEM (compare-and-swap por `updated_at`):
  // duas chamadas concorrentes (card + timeline, realtime, retry, dois
  // atendentes na mesma conversa) chegavam aqui juntas, geravam o resumo duas
  // vezes e gravavam dois eventos. Só quem vence o CAS gera; o perdedor
  // devolve o resumo vigente sem chamar a IA e sem registrar evento.
  {
    const { data: reivindicada } = await supabaseAdmin
      .from(TABELA as never)
      .update({ status: "gerando", erro: null, updated_at: new Date().toISOString() } as never)
      .eq("id", linha.id)
      .eq("updated_at", linha.updated_at)
      .eq("situacao", "active")
      .gt("handoff_em", new Date(Date.now() - RETENCAO_RESUMO_MS).toISOString())
      .select("*")
      .maybeSingle();
    if (!reivindicada) {
      const atual = await ultimaLinha(clinicaId, conversaId);
      return atual;
    }
    linha = reivindicada as LinhaResumo;
  }

  const desfecho = (linha.desfecho ?? "handoff_humano") as DesfechoConversa;
  try {
    const [texto, agendado] = await Promise.all([
      transcricao(clinicaId, conversaId, linha.atendimento_inicio),
      agendamentoReal(
        clinicaId,
        conv.contato_paciente_id ?? null,
        limiteTranscricaoResumo(linha.atendimento_inicio),
        conv.nina_fluxo_estado?.appointment?.appointment_id ?? null,
      ),
    ]);
    if (!texto.trim()) throw new Error("Conversa sem mensagens para resumir");
    const bruto = await chamarModelo(
      `Contato: ${conv.contato_nome ?? "não informado"}\n` +
        `Motivo registrado da transferência: ${conv.handoff_motivo ?? "não informado"}\n` +
        `Desfecho registrado pelo sistema (fato, não inferência): ${
          ROTULO_DESFECHO[desfecho] ?? "Atualização do atendimento"
        }\n\n` +
        `Último atendimento iniciado em ${linha.atendimento_inicio}. Apenas mensagens dos últimos sete dias:\n${texto}`,
    );
    const payload = ajustarResumoPorDesfecho(
      normalizarResumo(bruto, {
        motivoHandoff: conv.handoff_motivo ?? null,
        // FASE 3 — o resumo entregue ao humano reutiliza o MESMO protocolo
        // do handoff; nunca é recalculado nem inventado pelo modelo.
        protocolo: conv.protocolo_atendimento ?? null,
        agendamentoReal: agendado,
        ...(args.extras ?? {}),
      }),
      desfecho,
    );
    const { data } = await supabaseAdmin
      .from(TABELA as never)
      .update({ status: "ok", payload: payload as never, erro: null } as never)
      .eq("id", linha.id)
      .eq("updated_at", linha.updated_at)
      .eq("situacao", "active")
      .gt("handoff_em", new Date(Date.now() - RETENCAO_RESUMO_MS).toISOString())
      .select("*")
      .maybeSingle();
    if (!data) return await ultimaLinha(clinicaId, conversaId);
    linha = data as LinhaResumo;

    // Idempotência do evento: a mesma versão do resumo nunca gera dois avisos.
    const { data: eventoExistente } = await supabaseAdmin
      .from("atend_conversa_eventos")
      .select("id")
      .eq("conversa_id", conversaId)
      .eq("evento", "RESUMO_IA_GERADO")
      .eq("detalhes->>versao", String(linha.versao))
      .limit(1)
      .maybeSingle();
    if (!eventoExistente) {
      await registrarEvento({
        clinicaId,
        conversaId,
        evento: "RESUMO_IA_GERADO" as never,
        detalhes: { versao: linha.versao },
      });
    }
    return linha;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha desconhecida";
    console.error("[handoff-resumo] falha ao gerar", conversaId, msg);
    const { data } = await supabaseAdmin
      .from(TABELA as never)
      .update({ status: "erro", erro: msg.slice(0, 500) } as never)
      .eq("id", linha.id)
      .eq("updated_at", linha.updated_at)
      .eq("situacao", "active")
      .gt("handoff_em", new Date(Date.now() - RETENCAO_RESUMO_MS).toISOString())
      .select("*")
      .maybeSingle();
    return (data as LinhaResumo | null) ?? (await ultimaLinha(clinicaId, conversaId));
  }
}

/** Datas vêm dos eventos/ciclo do sistema, nunca de inferência da IA. */
async function inicioAtendimento(clinicaId: string, conversaId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("atend_resumo_inicio_atendimento", {
    _clinica_id: clinicaId,
    _conversa_id: conversaId,
    _ate: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Histórico é montado na leitura, sem copiar resumos antigos para uma versão nova. */
export async function obterPainelResumo(args: {
  clinicaId: string;
  conversaId: string;
  forcar?: boolean;
}): Promise<PainelResumo | null> {
  const { data: conversa, error: erroConversa } = await supabaseAdmin
    .from("atend_conversas")
    .select("status, handoff_em")
    .eq("clinica_id", args.clinicaId)
    .eq("id", args.conversaId)
    .maybeSingle();
  if (erroConversa) throw new Error(erroConversa.message);
  if (!conversa) return null;
  // Compatibilidade com uma transferência recente ainda sem reserva.
  await garantirResumoHandoff({ ...args, ignorarHandoff: !conversa.handoff_em });
  const [inicio, resultado] = await Promise.all([
    inicioAtendimento(args.clinicaId, args.conversaId),
    supabaseAdmin
      .from(TABELA)
      .select("*")
      .eq("clinica_id", args.clinicaId)
      .eq("conversa_id", args.conversaId)
      .gt("handoff_em", new Date(Date.now() - RETENCAO_RESUMO_MS).toISOString())
      .order("handoff_em", { ascending: false }),
  ]);
  if (resultado.error) throw new Error(resultado.error.message);
  if (!inicio) return null;
  const painel = montarPainelResumo(
    resultado.data as LinhaResumo[],
    inicio,
    ["closed", "finished"].includes(conversa.status),
  );
  return painel.atual || painel.anteriores.length ? painel : null;
}
