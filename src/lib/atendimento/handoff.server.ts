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

/** A Nina pode falar nesta conversa? Conversa inexistente ainda = sim (é nova). */
export function ninaPodeResponder(conv: EstadoConversa | null): boolean {
  if (!conv) return true;
  if (conv.status === "closed" || conv.status === "finished") return true;
  return conv.owner_type === "AI" && conv.ai_enabled !== false;
}

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
  | "ATENDIMENTO_ENCERRADO";

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

/** Janela em que consideramos o atendente realmente online (heartbeat). */
const PRESENCA_FRESCA_MS = 5 * 60 * 1000;

/**
 * Atribui a conversa a um atendente online (status ONLINE + aceita_novas),
 * escolhendo quem tem menos conversas ativas. Se ninguém estiver online,
 * a conversa fica na fila como antes.
 */
export async function atribuirAtendenteOnline(args: {
  clinicaId: string;
  conversaId: string;
  departamentoId?: string | null;
}): Promise<{ userId: string; nome: string } | null> {
  const desde = new Date(Date.now() - PRESENCA_FRESCA_MS).toISOString();
  const { data: presencas } = await supabaseAdmin
    .from("atend_agente_presenca")
    .select("user_id, status, aceita_novas, visto_em")
    .eq("clinica_id", args.clinicaId)
    .eq("status", "ONLINE")
    .eq("aceita_novas", true)
    .gte("visto_em", desde);

  let candidatos = (presencas ?? []).map((p) => p.user_id);
  if (candidatos.length === 0) return null;

  // Prioriza quem pertence ao setor de destino, quando houver.
  if (args.departamentoId) {
    const { data: membros } = await supabaseAdmin
      .from("atend_departamento_membros")
      .select("user_id")
      .eq("clinica_id", args.clinicaId)
      .eq("departamento_id", args.departamentoId);
    const doSetor = candidatos.filter((u) =>
      (membros ?? []).some((m) => m.user_id === u),
    );
    if (doSetor.length > 0) candidatos = doSetor;
  }

  // Menor carga: conversas ativas atribuídas a cada candidato.
  const { data: ativas } = await supabaseAdmin
    .from("atend_conversas")
    .select("atribuida_user_id")
    .eq("clinica_id", args.clinicaId)
    .in("status", ["active", "in_progress"])
    .in("atribuida_user_id", candidatos);
  const carga = new Map<string, number>(candidatos.map((u) => [u, 0]));
  (ativas ?? []).forEach((c) => {
    const u = c.atribuida_user_id as string | null;
    if (u && carga.has(u)) carga.set(u, (carga.get(u) ?? 0) + 1);
  });
  const escolhido = candidatos.sort(
    (a, b) => (carga.get(a) ?? 0) - (carga.get(b) ?? 0),
  )[0];
  if (!escolhido) return null;

  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("atend_conversas")
    .update({
      owner_type: "HUMAN",
      ai_enabled: false,
      atribuida_user_id: escolhido,
      status: "active",
      aguardando_desde: null,
      updated_at: agora,
    })
    .eq("id", args.conversaId)
    .eq("clinica_id", args.clinicaId)
    .is("atribuida_user_id", null);
  if (error) {
    console.error("[handoff] falha ao atribuir atendente online", error.message);
    return null;
  }

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("nome")
    .eq("id", escolhido)
    .maybeSingle();
  const nome = ((prof as { nome?: string | null } | null)?.nome ?? "Atendente").trim();

  await registrarEvento({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    evento: "ASSUMIDA",
    userId: escolhido,
    departamentoId: args.departamentoId ?? null,
    motivo: "Atribuição automática (atendente online)",
  });
  await registrarMarcadorSistema({
    clinicaId: args.clinicaId,
    conversaId: args.conversaId,
    texto: `👤 Atribuída automaticamente a ${nome} (online).`,
  });

  return { userId: escolhido, nome };
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
