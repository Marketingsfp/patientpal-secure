/**
 * Estado estruturado do atendimento/agendamento da Nina (server-only).
 *
 * POR QUE EXISTE: o contexto do paciente vivia apenas dentro de UMA chamada
 * do modelo. `identificar_paciente` gravava `ctx.pacienteId` em memória; na
 * mensagem seguinte o contexto era remontado do zero (só pelo telefone), o
 * `pacienteId` voltava a ser nulo e a ferramenta `agendar` devolvia
 * PATIENT_NOT_VERIFIED — o modelo traduzia isso para "esqueci de confirmar
 * seus dados" e pedia CPF/nome/nascimento de novo, mesmo já tendo dito
 * "encontrei seu cadastro".
 *
 * A correção é guardar na PRÓPRIA CONVERSA (coluna `nina_fluxo_estado`) um
 * estado pequeno e estruturado: quem é o paciente (id, primeiro nome, se está
 * identificado/validado), o que já foi escolhido do agendamento e em que
 * etapa o fluxo está. Esse estado é recarregado antes de cada chamada do
 * modelo e reescrito depois das ferramentas.
 *
 * PRIVACIDADE: não guardamos CPF nem data de nascimento aqui. O que interessa
 * é o `paciente_id` interno — é ele que a criação do agendamento usa. Os dados
 * pessoais ficam só no cadastro do paciente.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EtapaFluxoNina =
  | "IDLE"
  | "IDENTIFYING_PATIENT"
  | "CHOOSING_SLOT"
  | "AWAITING_SLOT_CONFIRMATION"
  | "AWAITING_PATIENT_DATA"
  | "REVALIDATING_SLOT"
  | "APPOINTMENT_FAILED"
  | "BOOKED";

export type EstadoFluxoNina = {
  patient: {
    id: string | null;
    /** Primeiro nome apenas — o suficiente para tratar a pessoa pelo nome. */
    first_name: string | null;
    identified: boolean;
    validated: boolean;
    /**
     * Dados de identificação já informados, mas ainda incompletos. Existe para
     * o paciente poder mandar nome numa mensagem e CPF na seguinte sem que a
     * Nina recomece a coleta.
     */
    pending: {
      nome: string | null;
      cpf: string | null;
      data_nascimento: string | null;
    };
  };
  appointment: {
    doctor_id: string | null;
    doctor_name: string | null;
    specialty: string | null;
    procedure: string | null;
    date: string | null;
    time: string | null;
    slot_inicio: string | null;
    slot_fim: string | null;
    slot_confirmed_by_patient: boolean;
    /** Paciente disse "sim/isso/pode marcar" para a vaga oferecida. */
    intent_confirmed: boolean;
    appointment_id: string | null;
  };
  flow: { stage: EtapaFluxoNina };
  updated_at: string | null;
};

export function estadoVazio(): EstadoFluxoNina {
  return {
    patient: {
      id: null,
      first_name: null,
      identified: false,
      validated: false,
      pending: { nome: null, cpf: null, data_nascimento: null },
    },
    appointment: {
      doctor_id: null,
      doctor_name: null,
      specialty: null,
      procedure: null,
      date: null,
      time: null,
      slot_inicio: null,
      slot_fim: null,
      slot_confirmed_by_patient: false,
      intent_confirmed: false,
      appointment_id: null,
    },
    flow: { stage: "IDLE" },
    updated_at: null,
  };
}


/** Normaliza qualquer JSON gravado para o formato atual (tolerante a versões). */
export function normalizarEstado(bruto: unknown): EstadoFluxoNina {
  const base = estadoVazio();
  if (!bruto || typeof bruto !== "object") return base;
  const o = bruto as Record<string, any>;
  return {
    patient: {
      ...base.patient,
      ...(o["patient"] ?? {}),
      pending: { ...base.patient.pending, ...(o["patient"]?.pending ?? {}) },
    },

    appointment: { ...base.appointment, ...(o["appointment"] ?? {}) },
    flow: { stage: (o["flow"]?.stage ?? "IDLE") as EtapaFluxoNina },
    updated_at: o["updated_at"] ?? null,
  };
}

type Db = SupabaseClient<any, any, any>;

export async function carregarFluxoEstado(
  db: Db,
  clinicaId: string,
  conversaId: string | null,
): Promise<EstadoFluxoNina> {
  if (!conversaId) return estadoVazio();
  const { data } = await db
    .from("atend_conversas")
    .select("nina_fluxo_estado")
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return normalizarEstado((data as any)?.nina_fluxo_estado ?? null);
}

export async function salvarFluxoEstado(
  db: Db,
  clinicaId: string,
  conversaId: string | null,
  estado: EstadoFluxoNina,
): Promise<void> {
  if (!conversaId) return;
  try {
    await db
      .from("atend_conversas")
      .update({ nina_fluxo_estado: { ...estado, updated_at: new Date().toISOString() } } as never)
      .eq("id", conversaId)
      .eq("clinica_id", clinicaId);
  } catch (e) {
    // Estado é otimização de contexto: se falhar, o atendimento continua.
    console.error("[nina-fluxo] falha ao salvar estado", e);
  }
}

/** Encerramento do fluxo: conversa resolvida, cancelada ou sessão nova. */
export async function limparFluxoEstado(
  db: Db,
  clinicaId: string,
  conversaId: string | null,
): Promise<void> {
  if (!conversaId) return;
  try {
    await db
      .from("atend_conversas")
      .update({ nina_fluxo_estado: null } as never)
      .eq("id", conversaId)
      .eq("clinica_id", clinicaId);
  } catch (e) {
    console.error("[nina-fluxo] falha ao limpar estado", e);
  }
}

/**
 * Bloco injetado no prompt. É a tradução do estado para regras — o modelo
 * não precisa "lembrar" pelo texto da conversa.
 */
export function blocoPromptEstado(estado: EstadoFluxoNina): string {
  const p = estado.patient;
  const a = estado.appointment;
  const linhas: string[] = ["ESTADO ESTRUTURADO DESTE ATENDIMENTO (fonte de verdade — confie nele):"];

  if (p.identified && p.id) {
    linhas.push(
      `- Paciente JÁ IDENTIFICADO e VALIDADO${p.first_name ? ` (${p.first_name})` : ""}. O sistema já tem o cadastro interno dele.`,
      "- PROIBIDO pedir de novo nome, CPF ou data de nascimento. Também é proibido dizer que 'esqueceu' de confirmar dados.",
      "- Para marcar, chame 'agendar' direto: o paciente já está vinculado a esta conversa no backend.",
      "- Não repita CPF nem data de nascimento nas respostas.",
    );
  } else {
    linhas.push(
      "- Paciente ainda NÃO identificado. Só peça CPF, nome completo e data de nascimento quando houver intenção clara de agendar.",
    );
  }

  const escolhido: string[] = [];
  if (a.doctor_name) escolhido.push(`profissional: ${a.doctor_name}`);
  if (a.specialty) escolhido.push(`especialidade: ${a.specialty}`);
  if (a.procedure) escolhido.push(`procedimento: ${a.procedure}`);
  if (a.date) escolhido.push(`data: ${a.date}`);
  if (a.time) escolhido.push(`hora: ${a.time}`);
  if (escolhido.length > 0) {
    linhas.push(
      `- Já definido nesta conversa — NÃO pergunte de novo: ${escolhido.join(" | ")}.`,
    );
  }
  if (a.slot_inicio && a.slot_fim) {
    linhas.push(
      `- Último horário OFERECIDO ao paciente: inicio=${a.slot_inicio} fim=${a.slot_fim}. Se ele responder "sim", "pode ser", "confirma" ou equivalente, a intenção é CONFIRMAR ESTE HORÁRIO: chame 'agendar' com exatamente esse inicio/fim — não recomece a identificação.`,
    );
  }
  if (a.appointment_id) {
    linhas.push(
      `- Já existe agendamento criado nesta conversa (id interno registrado). Não marque de novo o mesmo horário; se o paciente quiser outro, trate como remarcação.`,
    );
  }
  linhas.push(`- Etapa atual do fluxo: ${estado.flow.stage}.`);
  linhas.push(
    "- Regra geral: antes de perguntar qualquer coisa, verifique este estado. Colete SOMENTE o que ainda falta.",
  );
  return linhas.join("\n");
}
