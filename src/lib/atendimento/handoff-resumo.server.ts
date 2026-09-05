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

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const TABELA = "atend_handoff_resumos";

export type StatusResumo = "gerando" | "ok" | "erro";

export interface LinhaResumo {
  id: string;
  conversa_id: string;
  versao: number;
  handoff_em: string;
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
  const { data: existente } = await supabaseAdmin
    .from(TABELA as never)
    .select("id")
    .eq("conversa_id", args.conversaId)
    .eq("handoff_em", args.handoffEm)
    .maybeSingle();
  if (existente) return; // idempotente: mesma transferência não gera dois resumos

  const { count } = await supabaseAdmin
    .from(TABELA as never)
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", args.conversaId);
  // Só pode existir UM resumo vigente por conversa: o anterior vira histórico.
  await superarResumos(args.clinicaId, args.conversaId);
  const { error } = await supabaseAdmin
    .from(TABELA as never)
    .upsert(
      {
        clinica_id: args.clinicaId,
        conversa_id: args.conversaId,
        handoff_em: args.handoffEm,
        motivo: args.motivo ?? null,
        versao: (count ?? 0) + 1,
        status: "gerando",
        situacao: "active",
        desfecho: args.desfecho ?? "handoff_humano",
        ...(args.resolvidoPor ? { resolvido_por: args.resolvidoPor } : {}),
      } as never,
      { onConflict: "conversa_id,handoff_em", ignoreDuplicates: true },
    );
  if (error) console.error("[handoff-resumo] falha ao reservar", error.message);
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
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ativo) return ativo as LinhaResumo;
  const { data } = await supabaseAdmin
    .from(TABELA as never)
    .select("*")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as LinhaResumo | null) ?? null;
}



/** Agendamento REAL do paciente ligado a esta conversa (nunca inferido pela IA). */
async function agendamentoReal(
  clinicaId: string,
  pacienteId: string | null,
): Promise<AgendamentoConfirmado | null> {
  if (!pacienteId) return null;
  const { data } = await supabaseAdmin
    .from("agendamentos")
    .select("data_hora, status, servico_nome, medico_nome")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .in("status", ["agendado", "confirmado"])
    .gte("data_hora", new Date(Date.now() - 3600_000).toISOString())
    .order("data_hora", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as
    | { data_hora?: string; servico_nome?: string | null; medico_nome?: string | null }
    | null;
  if (!row?.data_hora) return null;
  const d = new Date(row.data_hora);
  return {
    medico: row.medico_nome ?? null,
    servico: row.servico_nome ?? null,
    data: d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    hora: d.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

async function transcricao(clinicaId: string, conversaId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("whatsapp_mensagens")
    .select("body, direction, enviada_por, recebida_em, created_at, tipo")
    .eq("clinica_id", clinicaId)
    .eq("conversa_id", conversaId)
    .order("recebida_em", { ascending: false })
    .limit(60);
  const linhas = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((m) => m.enviada_por !== "sistema")
    .reverse()
    .map((m) => {
      const quem =
        m.direction === "in" ? "Paciente" : m.enviada_por === "humano" ? "Atendente" : "Nina";
      const txt = String(m.body ?? "").trim() || `[${String(m.tipo ?? "mídia")}]`;
      return `${quem}: ${txt.slice(0, 700)}`;
    });
  return linhas.join("\n").slice(0, 12_000);
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
    .select("handoff_em, handoff_motivo, contato_paciente_id, contato_nome")
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  const conv = convData as {
    handoff_em?: string | null;
    handoff_motivo?: string | null;
    contato_paciente_id?: string | null;
    contato_nome?: string | null;
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
  if (!linha) return null;
  if (linha.status === "ok" && !args.forcar) return linha;

  const desfecho = (linha.desfecho ?? "handoff_humano") as DesfechoConversa;
  try {
    const [texto, agendado] = await Promise.all([
      transcricao(clinicaId, conversaId),
      agendamentoReal(clinicaId, conv.contato_paciente_id ?? null),
    ]);
    if (!texto.trim()) throw new Error("Conversa sem mensagens para resumir");
    const bruto = await chamarModelo(
      `Contato: ${conv.contato_nome ?? "não informado"}\n` +
        `Motivo registrado da transferência: ${conv.handoff_motivo ?? "não informado"}\n` +
        `Desfecho registrado pelo sistema (fato, não inferência): ${
          ROTULO_DESFECHO[desfecho] ?? "Atualização do atendimento"
        }\n\n` +
        `Conversa:\n${texto}`,
    );
    const payload = ajustarResumoPorDesfecho(
      normalizarResumo(bruto, {
        motivoHandoff: conv.handoff_motivo ?? null,
        agendamentoReal: agendado,
        ...(args.extras ?? {}),
      }),
      desfecho,
    );
    const { data } = await supabaseAdmin
      .from(TABELA as never)
      .update({ status: "ok", payload: payload as never, erro: null } as never)
      .eq("id", linha.id)
      .select("*")
      .maybeSingle();
    linha = (data as LinhaResumo | null) ?? { ...linha, status: "ok", payload };

    await registrarEvento({
      clinicaId,
      conversaId,
      evento: "RESUMO_IA_GERADO" as never,
      detalhes: { versao: linha.versao },
    });
    return linha;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha desconhecida";
    console.error("[handoff-resumo] falha ao gerar", conversaId, msg);
    const { data } = await supabaseAdmin
      .from(TABELA as never)
      .update({ status: "erro", erro: msg.slice(0, 500) } as never)
      .eq("id", linha.id)
      .select("*")
      .maybeSingle();
    return (data as LinhaResumo | null) ?? { ...linha, status: "erro", erro: msg };
  }
}
