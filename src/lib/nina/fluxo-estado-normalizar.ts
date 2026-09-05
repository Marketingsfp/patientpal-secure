/**
 * Tipos e normalização do estado de fluxo da Nina (puro, sem Supabase).
 * Separado do arquivo .server para poder ser usado em qualquer camada.
 */

export type EtapaFluxoNina =
  | "IDLE"
  | "BOOKING_INTENT_CONFIRMED"
  | "IDENTIFYING_PATIENT"
  | "CHOOSING_SLOT"
  | "AWAITING_SLOT_CONFIRMATION"
  | "AWAITING_PATIENT_DATA"
  | "REVALIDATING_SLOT"
  | "APPOINTMENT_FAILED"
  | "BOOKED"
  // Fase 6 — máquina de estados explícita do novo fluxo de atendimento.
  // Os nomes acima continuam válidos (histórico gravado em conversas antigas).
  | "GREETING"
  | "INTENT_IDENTIFICATION"
  | "INFORMATION_RESPONSE"
  | "BOOKING_INTENT_PENDING"
  | "COLLECTING_PATIENT_DATA"
  | "COLLECTING_BOOKING_PREFERENCES"
  | "CHECKING_AVAILABILITY"
  | "WAITING_SLOT_SELECTION"
  | "WAITING_FINAL_CONFIRMATION"
  | "CREATING_APPOINTMENT"
  | "APPOINTMENT_CONFIRMED"
  | "HANDOFF"
  | "COMPLETED";


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
  /** Identificador da sessão operacional atual (nova sessão = novo id). */
  session_id?: string | null;
  /** Início da sessão operacional atual. */
  session_started_at?: string | null;
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
    session_id: null,
    session_started_at: null,
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
    session_id: o["session_id"] ?? null,
    session_started_at: o["session_started_at"] ?? null,
  };
}

