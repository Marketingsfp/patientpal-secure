/**
 * FASE 4 — contexto do resumo quando a transferência acontece por inatividade.
 *
 * Regras puras (sem banco, sem IA): traduzem a etapa em que o fluxo parou e
 * dizem, em linguagem de atendimento, o que ficou pendente. Este conteúdo é
 * INTERNO — nunca vira mensagem para o paciente.
 */
import type { EstadoFluxoNina, EtapaFluxoNina } from "./fluxo-estado-normalizar";
import { etapaTransacional } from "./sessao";

export const ROTULO_ETAPA: Partial<Record<EtapaFluxoNina, string>> = {
  IDLE: "Sem operação em andamento",
  GREETING: "Saudação",
  INTENT_IDENTIFICATION: "Identificação da intenção",
  INFORMATION_RESPONSE: "Resposta de informação",
  BOOKING_INTENT_PENDING: "Intenção de agendar ainda não confirmada",
  BOOKING_INTENT_CONFIRMED: "Intenção de agendar confirmada",
  IDENTIFYING_PATIENT: "Identificação do paciente",
  COLLECTING_PATIENT_DATA: "Coleta dos dados do paciente",
  AWAITING_PATIENT_DATA: "Aguardando dados do paciente",
  COLLECTING_BOOKING_PREFERENCES: "Coleta de preferências (data, período, profissional)",
  CHECKING_AVAILABILITY: "Consulta de disponibilidade",
  CHOOSING_SLOT: "Escolha de horário",
  WAITING_SLOT_SELECTION: "Aguardando escolha de horário",
  AWAITING_SLOT_CONFIRMATION: "Aguardando confirmação do horário",
  WAITING_FINAL_CONFIRMATION: "Aguardando confirmação final do agendamento",
  REVALIDATING_SLOT: "Revalidação do horário",
  CREATING_APPOINTMENT: "Criação do agendamento",
  APPOINTMENT_CONFIRMED: "Agendamento confirmado",
  APPOINTMENT_FAILED: "Falha ao agendar",
  HANDOFF: "Transferência para atendimento humano",
  COMPLETED: "Atendimento concluído",
};

export function rotuloEtapa(etapa: EtapaFluxoNina | string | null | undefined): string | null {
  if (!etapa) return null;
  return ROTULO_ETAPA[etapa as EtapaFluxoNina] ?? String(etapa);
}

/** O que a equipe precisa retomar, dado onde a conversa parou. */
export function pendenciasTimeout(estado: EstadoFluxoNina): string[] {
  const etapa = estado.flow?.stage ?? null;
  const a = estado.appointment ?? ({} as EstadoFluxoNina["appointment"]);
  const pend: string[] = ["Confirmar se o paciente ainda tem interesse"];

  if (a.slot_inicio || a.date || a.time || a.intent_confirmed) {
    // Horário oferecido antes do silêncio não vale mais sem nova checagem.
    pend.push("Revalidar a disponibilidade do horário antes de confirmar qualquer agendamento");
  }
  if (etapaTransacional(etapa) && !a.appointment_id) {
    pend.push("Retomar o agendamento manualmente — nada foi criado pela Nina");
  }
  if (estado.patient && !estado.patient.identified) {
    pend.push("Concluir a identificação do paciente (nome, CPF e data de nascimento)");
  }
  return pend.slice(0, 5);
}

/** Preferências e dados já conversados, para o atendente não pedir de novo. */
export function informacoesEstado(estado: EstadoFluxoNina): string[] {
  const a = estado.appointment ?? ({} as EstadoFluxoNina["appointment"]);
  const itens: string[] = [];
  if (estado.patient?.first_name) itens.push(`Paciente: ${estado.patient.first_name}`);
  if (a.specialty) itens.push(`Especialidade: ${a.specialty}`);
  if (a.procedure) itens.push(`Procedimento: ${a.procedure}`);
  if (a.doctor_name) itens.push(`Profissional: ${a.doctor_name}`);
  if (a.date) itens.push(`Data pretendida: ${a.date}`);
  if (a.time) itens.push(`Horário pretendido: ${a.time}`);
  return itens;
}
