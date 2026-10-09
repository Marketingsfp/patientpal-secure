import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import type { SelecaoFonte } from "./fonte-consulta";
import { limparEscolhaAgendamento } from "./agendamento-escolha";

/** Mantém paciente e reservas; referências e escolhas pendentes precisam de nova consulta. */
export function alinharFonteDaSessao(estado: EstadoFluxoNina, atual: SelecaoFonte): boolean {
  const anterior = estado.fonte_consulta;
  const mudou = anterior
    ? anterior.fonte !== atual.fonte || anterior.revisao !== atual.revisao
    : atual.fonte !== "clinica_os" || atual.revisao !== null;
  if (mudou) {
    estado.knowledge_context = null;
    estado.clarification = undefined;
    estado.appointment.price = null;
    if (!estado.appointment.appointment_id) {
      limparEscolhaAgendamento(estado);
      estado.appointment.slot_options = null;
      estado.appointment.procedimento_solicitado = null;
      estado.appointment.doctor_id = null;
      estado.appointment.doctor_name = null;
      // O assunto permanece no histórico, mas não é uma seleção válida na nova fonte.
      estado.appointment.procedure = null;
      estado.appointment.specialty = null;
      estado.flow.stage = "IDLE";
    }
  }
  estado.fonte_consulta = atual;
  return mudou;
}
