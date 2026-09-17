import type { EstadoFluxoNina } from "../fluxo-estado-normalizar";

/** Prepara a evidência de um resumo entregue, sem chamar o executor sob teste. */
export function resumoEntregueFixture(estado: EstadoFluxoNina, clinicaId: string, aceita = false) {
  estado.session_id ??= "sessao-teste";
  const a = estado.appointment;
  a.modalidade_atendimento ??= "hora_marcada";
  a.agenda_id ??= null;
  a.date ??= a.slot_inicio!.slice(0, 10);
  a.time ??= new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(a.slot_inicio!));
  const resumo = `Confirma ${a.procedure} com ${a.doctor_name} em ${a.date} às ${a.time}?`;
  a.confirmation = {
    clinica_id: clinicaId,
    session_id: estado.session_id,
    resumo,
    aceita,
    vaga: {
      modalidade: a.modalidade_atendimento,
      agenda_id: a.agenda_id,
      medico_id: a.doctor_id!,
      medico: a.doctor_name!,
      procedimento: a.procedure,
      data: a.date,
      hora: a.time,
      inicio: a.slot_inicio!,
      fim: a.slot_fim!,
    },
  };
  a.slot_confirmed_by_patient = aceita;
  a.intent_confirmed = aceita;
  return resumo;
}
