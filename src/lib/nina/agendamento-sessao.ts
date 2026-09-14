import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import type { EstadoOperacionalTurno } from "./confidence/types";
import { etapaTransacional } from "./sessao";
import type { ResultadoBroker } from "./tool-broker";

const ETAPAS_CONFIRMADAS = new Set(["BOOKED", "APPOINTMENT_CONFIRMED", "COMPLETED"]);

/** O encerramento já é saneado antes desta leitura pelo resolvedor de sessão. */
export function reservaDaSessaoAtual(estado: EstadoFluxoNina): boolean {
  const a = estado.appointment;
  if (typeof a.appointment_id !== "string" || !a.appointment_id.trim()) return false;
  if (a.confirmed_in_session) return a.confirmed_in_session === estado.session_id;
  // Compatibilidade com atendimento legado que ainda não foi encerrado.
  // Um ID solto em IDLE/GREETING nunca reativa a reserva por conta própria.
  return ETAPAS_CONFIRMADAS.has(estado.flow.stage);
}

/** Retorno existente/idempotente não é prova de que uma nova reserva foi criada. */
export function resultadoComprovaCriacaoNoTurno(
  estado: EstadoFluxoNina,
  resultado: ResultadoBroker,
): boolean {
  const dados = resultado.dados as Record<string, unknown> | null;
  return (
    resultado.capacidade === "createAppointment" &&
    resultado.success &&
    !resultado.erro &&
    resultado.appointment_confirmed &&
    reservaDaSessaoAtual(estado) &&
    dados?.estado_acao === "CREATED" &&
    dados.verificado_no_banco === true &&
    dados.appointment_id === estado.appointment.appointment_id &&
    dados.duplicado !== true
  );
}

/** Mesmo contexto operacional para avaliações de ação e da mensagem final. */
export function estadoOperacionalDaSessao(
  estado: EstadoFluxoNina,
  turno: { ferramentaChamada: boolean; reservaCriada: boolean },
): EstadoOperacionalTurno {
  const confirmada = reservaDaSessaoAtual(estado);
  return {
    bookingIntentConfirmed: estado.appointment.intent_confirmed === true,
    appointmentFlowActive: etapaTransacional(estado.flow.stage),
    patientDataComplete: Boolean(estado.patient.identified && estado.patient.id),
    slotSelected: Boolean(estado.appointment.slot_inicio && estado.appointment.slot_fim),
    finalConfirmationReceived: estado.appointment.slot_confirmed_by_patient === true,
    appointmentAttempted: turno.ferramentaChamada,
    appointmentToolCalled: turno.ferramentaChamada,
    appointmentCreated: confirmada,
    appointmentFromCurrentSession: confirmada,
    appointmentCreatedThisTurn: turno.reservaCriada && confirmada && turno.ferramentaChamada,
    appointmentId: confirmada ? estado.appointment.appointment_id : null,
    workflowState: estado.flow.stage,
  };
}
