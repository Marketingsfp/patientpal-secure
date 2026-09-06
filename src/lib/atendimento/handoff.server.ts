/**
 * Atendimento híbrido Nina + humano — núcleo de estado (server-only).
 *
 * Regra central: quem conduz a conversa é `atend_conversas.owner_type`
 * ('AI' | 'HUMAN' | 'NONE'). A Nina só pode responder quando
 * `owner_type = 'AI'` E `ai_enabled = true`. Enquanto uma pessoa estiver com a
 * conversa (ou ela estiver na fila aguardando alguém), a IA fica em silêncio.
 *
 * Este arquivo usa service_role, então TODA consulta é filtrada por
 * `clinica_id` — nunca só pelo id da conversa.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ninaResponde } from "./ciclo-responsabilidade";

export type OwnerType = "AI" | "HUMAN" | "NONE";

export type EstadoConversa = {
  id: string;
  clinica_id: string;
  owner_type: OwnerType;
  ai_enabled: boolean;
  status: string;
  atribuida_user_id: string | null;
  departamento_id: string | null;
};

const CAMPOS =
  "id, clinica_id, owner_type, ai_enabled, status, atribuida_user_id, departamento_id";

export async function estadoConversaPorId(
  clinicaId: string,
  conversaId: string,
): Promise<EstadoConversa | null> {
  const { data } = await supabaseAdmin
    .from("atend_conversas")
    .select(CAMPOS)
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return (data as EstadoConversa | null) ?? null;
}

/** Telefone sempre comparado/gravado como só dígitos (evita conversa duplicada com e sem "+"). */
export function normalizarTelefone(t: string | null | undefined): string {
  return String(t ?? "").replace(/\D/g, "");
}

export async function estadoConversaPorTelefone(
  clinicaId: string,
  telefone: string,
): Promise<EstadoConversa | null> {
  const digits = normalizarTelefone(telefone);
  if (!digits) return null;
  const { data } = await supabaseAdmin
    .from("atend_conversas")
    .select(CAMPOS)
    .eq("clinica_id", clinicaId)
    .in("contato_telefone", [digits, `+${digits}`])
    .order("ultima_msg_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EstadoConversa | null) ?? null;
}

/**
 * A Nina pode falar nesta conversa? Conversa inexistente ainda = sim (é nova),
 * conversa resolvida = sim (nova sessão). Regra única em
 * `@/lib/atendimento/ciclo-responsabilidade`.
 */
export function ninaPodeResponder(conv: EstadoConversa | null): boolean {
  return ninaResponde(conv);
}

export { derivarResponsavel, conversaResolvida, inconsistenciasCiclo } from "./ciclo-responsabilidade";
export type { Responsavel } from "./ciclo-responsabilidade";

export type EventoConversa =
  | "HANDOFF_SOLICITADO"
  | "ENTROU_NA_FILA"
  | "ASSUMIDA"
  | "DESATRIBUIDA"
  | "TRANSFERIDA"
  | "DEVOLVIDA_PARA_IA"
  | "ATRIBUIDA_IA"
  | "REABERTA"
  | "FINALIZADA"
  | "IA_SILENCIADA"
  | "IA_MEMORIA_RESETADA"
  | "ATENDIMENTO_ENCERRADO"
  | "TIMEOUT_NINA";

export async function registrarEvento(args: {
  clinicaId: string;
  conversaId: string;
  evento: EventoConversa;
  userId?: string | null;
  departamentoId?: string | null;
  motivo?: string | null;
  detalhes?: Record<string, unknown> | null;
}) {
  const { error } = await supabaseAdmin.from("atend_conversa_eventos").insert({
    clinica_id: args.clinicaId,
    conversa_id: args.conversaId,
    evento: args.evento,
    user_id: args.userId ?? null,
    departamento_id: args.departamentoId ?? null,
    motivo: args.motivo ?? null,
    detalhes: (args.detalhes ?? null) as never,
  });
  if (error) console.error("[handoff] falha ao registrar evento", args.evento, error.message);
}

/** Escolhe o departamento (fila) pelo nome informado pela IA, com fallback. */
async function resolverDepartamento(clinicaId: string, nome?: string | null) {
  const { data } = await supabaseAdmin
    .from("atend_departamentos")
    .select("id, nome, prioridade")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .order("prioridade", { ascending: false });
  const lista = data ?? [];
  if (lista.length === 0) return null;
  if (nome) {
    const alvo = nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const achou = lista.find((d) =>
      String(d.nome ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(alvo),
    );
    if (achou) return achou;
  }
  return lista[0];
}

/**
 * Marcador visível na conversa (aparece para o atendente na timeline do chat).
 * Não vai para a Meta: é só um registro de sistema em `whatsapp_mensagens`.
 */
export async function registrarMarcadorSistema(args: {
  clinicaId: string;
  conversaId: string;
  texto: string;
}) {
  const { data: conv } = await supabaseAdmin
    .from("atend_conversas")
    .select("contato_telefone")
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId)
    .maybeSingle();
  const { error } = await supabaseAdmin.from("whatsapp_mensagens").insert({
    clinica_id: args.clinicaId,
    conversa_id: args.conversaId,
    direction: "out",
    from_number: null,
    to_number: (conv as { contato_telefone?: string | null } | null)?.contato_telefone ?? null,
    body: args.texto,
    tipo: "text",
    status: "system",
    enviada_por: "sistema",
  });
  if (error) console.error("[handoff] falha ao registrar marcador", error.message);
}

export type ResultadoHandoff = {
  ok: boolean;
  ja_estava_com_humano?: boolean;
  posicao_fila?: number;
  departamento?: string | null;
  atribuida_para?: string | null;
  mensagem: string;
};

/**
 * Encaminha a conversa da Nina para a fila humana.
 * Silencia a IA imediatamente (`ai_enabled = false`, `owner_type = 'NONE'`).
 */
export async function encaminharParaHumano(args: {
  clinicaId: string;
  conversaId: string;
  motivo: string;
  resumo?: string | null;
  urgencia?: "baixa" | "normal" | "alta";
  departamentoNome?: string | null;
  dadosColetados?: Record<string, unknown> | null;
  solicitadoPor?: "IA" | "PACIENTE" | "SISTEMA";
}): Promise<ResultadoHandoff> {
  const conv = await estadoConversaPorId(args.clinicaId, args.conversaId);
  if (!conv) return { ok: false, mensagem: "Conversa não encontrada." };

  if (conv.owner_type === "HUMAN") {
    return {
      ok: true,
      ja_estava_com_humano: true,
      mensagem: "Esta conversa já está com um atendente humano.",
    };
  }

  const depto = await resolverDepartamento(args.clinicaId, args.departamentoNome);
  const agora = new Date().toISOString();
  const prioridade = args.urgencia === "alta" ? 2 : args.urgencia === "baixa" ? 0 : 1;

  const { error } = await supabaseAdmin
    .from("atend_conversas")
    .update({
      owner_type: "NONE",
      ai_enabled: false,
      status: "waiting",
      departamento_id: depto?.id ?? conv.departamento_id,
      aguardando_desde: agora,
      handoff_motivo: args.motivo.slice(0, 500),
      handoff_resumo: {
        resumo: (args.resumo ?? "").slice(0, 2000),
        urgencia: args.urgencia ?? "normal",
        dados: args.dadosColetados ?? null,
        solicitado_por: args.solicitadoPor ?? "IA",
      } as never,
      handoff_em: agora,
      prioridade,
      updated_at: agora,
    })
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId);
  if (error) return { ok: false, mensagem: error.message };

  const { count } = await supabaseAdmin
    .from("atend_conversas")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", args.clinicaId)
    .eq("status", "waiting")
    .is("atribuida_user_id", null)
    .lte("aguardando_desde", agora);

  await registrarEvento({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    evento: "HANDOFF_SOLICITADO",
    departamentoId: depto?.id ?? null,
    motivo: args.motivo,
    detalhes: { urgencia: args.urgencia ?? "normal", resumo: args.resumo ?? null },
  });
  await registrarEvento({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    evento: "ENTROU_NA_FILA",
    departamentoId: depto?.id ?? null,
    detalhes: { posicao: count ?? 1 },
  });

  // Reserva o resumo interno desta transferência (idempotente e barato).
  // O texto em si é produzido depois, quando alguém abre a conversa: falha de
  // IA nunca pode segurar a fila nem a resposta ao paciente.
  try {
    const { reservarResumoHandoff } = await import("./handoff-resumo.server");
    await reservarResumoHandoff({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      handoffEm: agora,
      motivo: args.motivo,
      desfecho:
        args.motivo === "patient_response_timeout" ? "timeout_sem_resposta" : "handoff_humano",
    });

  } catch (e) {
    console.error("[handoff] falha ao reservar resumo", e);
  }


  await registrarMarcadorSistema({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    texto:
      `🔁 Conversa transferida da Nina para atendimento humano` +
      (depto?.nome ? ` · Setor: ${depto.nome}` : "") +
      ` · Motivo: ${args.motivo}` +
      (args.urgencia === "alta" ? " · URGENTE" : "") +
      ` · Posição na fila: ${count ?? 1}` +
      (args.resumo ? `\nResumo: ${args.resumo}` : ""),
  });

  // Conversas do console de homologação nunca ocupam um atendente real:
  // o restante do fluxo (fila, marcador, IA silenciada) é idêntico.
  const { data: convRow } = await supabaseAdmin
    .from("atend_conversas")
    .select("is_teste")
    .eq("id", args.conversaId)
    .maybeSingle();
  if ((convRow as any)?.is_teste) {
    return {
      ok: true,
      posicao_fila: count ?? 1,
      departamento: depto?.nome ?? null,
      atribuida_para: null,
      mensagem: "Conversa encaminhada para a equipe. A IA parou de responder.",
    };
  }

  // Se houver atendente online, a conversa já sai da fila atribuída a ele.
  const atribuida = await atribuirAtendenteOnline({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    departamentoId: depto?.id ?? null,
  });

  return {
    ok: true,
    posicao_fila: atribuida ? 0 : (count ?? 1),
    departamento: depto?.nome ?? null,
    atribuida_para: atribuida?.nome ?? null,
    mensagem: atribuida
      ? `Conversa encaminhada e atribuída a ${atribuida.nome}. A IA parou de responder.`
      : "Conversa encaminhada para a equipe. A IA parou de responder.",
  };
}

/**
 * Atribui a conversa a um atendente online, escolhendo quem tem MENOS
 * conversas ativas (empate: quem recebeu há mais tempo). Se ninguém estiver
 * online, retorna null e a conversa fica na fila "Não atribuídas".
 *
 * A decisão inteira acontece no banco (`atend_auto_assign_conversa`), dentro de
 * uma transação com lock por clínica: duas mensagens que chegam no mesmo
 * instante nunca colocam duas pessoas na mesma conversa nem sobrecarregam a
 * mesma atendente.
 */
export async function atribuirAtendenteOnline(args: {
  clinicaId: string;
  conversaId: string;
  departamentoId?: string | null;
  origem?: "auto_assignment" | "queue_distribution";
  /** Não grava o banner de sistema (quem chama já registra o próprio evento). */
  semMarcador?: boolean;
}): Promise<{ userId: string; nome: string } | null> {
  const { data: escolhido, error } = await supabaseAdmin.rpc("atend_auto_assign_conversa", {
    _conversa_id: args.conversaId,
    _clinica_id: args.clinicaId,
    _departamento_id: args.departamentoId ?? null,
    _origem: args.origem ?? "auto_assignment",
  } as never);
  if (error) {
    console.error("[handoff] falha ao atribuir atendente online", error.message);
    return null;
  }
  const userId = (escolhido as string | null) ?? null;
  if (!userId) return null;

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("nome")
    .eq("id", userId)
    .maybeSingle();
  const nome = ((prof as { nome?: string | null } | null)?.nome ?? "Atendente").trim();

  if (!args.semMarcador)
    await registrarMarcadorSistema({
      clinicaId: args.clinicaId,
      conversaId: args.conversaId,
      texto: `👤 Atribuída automaticamente a ${nome} (online).`,
    });

  return { userId, nome };
}



/** Devolve a conversa para a Nina (reativa a IA). */
export async function devolverParaIA(args: {
  clinicaId: string;
  conversaId: string;
  userId?: string | null;
  motivo?: string | null;
}) {
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("atend_conversas")
    .update({
      owner_type: "AI",
      ai_enabled: true,
      atribuida_user_id: null,
      status: "bot_attending",
      aguardando_desde: null,
      updated_at: agora,
    })
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId);
  if (error) throw new Error(error.message);
  await registrarEvento({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    evento: "DEVOLVIDA_PARA_IA",
    userId: args.userId ?? null,
    motivo: args.motivo ?? null,
  });
}

/** Status considerados "conversa encerrada" na arquitetura atual. */
export const STATUS_ENCERRADOS = ["closed", "finished", "resolved"];

/**
 * Reabre automaticamente uma conversa encerrada quando chega uma nova mensagem
 * real do paciente.
 *
 * - Persiste o novo status (não é efeito visual do frontend).
 * - Zera a responsabilidade humana anterior: resolver encerra aquela
 *   responsabilidade operacional; a distribuição recomeça pelas regras atuais.
 * - Encerra estados transacionais da sessão da Nina, preservando o contexto
 *   recente (nada de histórico, CRM, agendamento ou Base é apagado).
 * - Idempotente: o UPDATE só acerta linhas ainda encerradas, então webhook
 *   duplicado, retry ou duas instâncias não geram duas reaberturas.
 */
export async function reabrirConversaPorMensagemPaciente(args: {
  clinicaId: string;
  telefone: string;
}): Promise<Array<{ id: string }>> {
  const digits = normalizarTelefone(args.telefone);
  if (!digits) return [];

  const { data: alvos } = await supabaseAdmin
    .from("atend_conversas")
    .select("id, nina_fluxo_estado")
    .eq("clinica_id", args.clinicaId)
    .in("contato_telefone", [digits, `+${digits}`])
    .in("status", STATUS_ENCERRADOS);
  if (!alvos || alvos.length === 0) return [];

  const { ninaDesativadaNaClinica } = await import("@/lib/nina-desligada.server");
  const ninaOff = await ninaDesativadaNaClinica(args.clinicaId).catch(() => false);
  const { normalizarEstado } = await import("@/lib/nina/fluxo-estado.server");
  const { reabrirSessao } = await import("@/lib/nina/sessao");

  const agora = new Date().toISOString();
  const reabertas: Array<{ id: string }> = [];

  for (const alvo of alvos as Array<{ id: string; nina_fluxo_estado: unknown }>) {
    // Nova sessão operacional: contexto recente pode continuar, operação antiga não.
    const estado = reabrirSessao(normalizarEstado(alvo.nina_fluxo_estado), agora);
    const { data: ok } = await supabaseAdmin
      .from("atend_conversas")
      .update({
        status: ninaOff ? "waiting" : "bot_attending",
        owner_type: ninaOff ? "NONE" : "AI",
        ai_enabled: !ninaOff,
        atribuida_user_id: null,
        assigned_at: null,
        aguardando_desde: ninaOff ? agora : null,
        resolved_at: null,
        closed_at: null,
        // Sem responsável humano herdado e sem prazos/resumos da sessão anterior.
        handoff_resumo: null,
        handoff_motivo: null,
        handoff_em: null,
        awaiting_patient_since: null,
        patient_response_deadline: null,
        ultima_msg_em: agora,
        updated_at: agora,
        nina_fluxo_estado: { ...estado, updated_at: agora } as never,
      } as never)
      .eq("id", alvo.id)
      .eq("clinica_id", args.clinicaId)
      // Trava de idempotência: se outra instância já reabriu, 0 linhas.
      .in("status", STATUS_ENCERRADOS)
      .select("id");
    if (!ok || ok.length === 0) continue;

    reabertas.push({ id: alvo.id });
    // Ciclo novo: o resumo do atendimento anterior vira histórico e deixa de
    // ser exibido como situação atual da conversa.
    try {
      const { arquivarResumosConversa } = await import("./handoff-resumo.server");
      await arquivarResumosConversa(args.clinicaId, alvo.id);
    } catch (e) {
      console.error("[reabertura] falha ao arquivar resumo", e);
    }
    await registrarEvento({
      clinicaId: args.clinicaId,
      conversaId: alvo.id,
      evento: "REABERTA",
      motivo: "Conversa reaberta automaticamente após nova mensagem do paciente",
    });

    if (!ninaOff) {
      await registrarEvento({
        clinicaId: args.clinicaId,
        conversaId: alvo.id,
        evento: "ATRIBUIDA_IA",
        motivo: "Reabertura: novo atendimento volta para a Nina",
      });
    }
  }
  return reabertas;
}
