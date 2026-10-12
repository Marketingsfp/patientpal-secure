/**
 * FASE 4 do novo fluxo de atendimento da Nina — disponibilidade real,
 * escolha de horário e CONFIRMAÇÃO FINAL.
 *
 * Regras centrais:
 * - vaga vem SEMPRE da agenda do sistema (ferramentas), nunca da planilha
 *   nem do modelo;
 * - escolher um horário NÃO é confirmar: antes de gravar, a Nina mostra o
 *   resumo e pergunta "Posso confirmar esse agendamento?";
 * - sem resposta positiva clara, nenhuma operação é executada.
 *
 * Módulo PURO: só lê o estado da conversa.
 */
import type { EstadoFluxoNina } from "./fluxo-estado.server";

/** Dados mínimos para consultar a agenda com sentido. */
export type DadoAgenda = "procedimento" | "profissional" | "preferencia_data";

export function faltaParaConsultarAgenda(estado: EstadoFluxoNina): DadoAgenda[] {
  const a = estado.appointment;
  const falta: DadoAgenda[] = [];
  if (!a.procedure && !a.specialty) falta.push("procedimento");
  if (!a.doctor_id && !a.doctor_name && !a.specialty) falta.push("profissional");
  if (!a.date) falta.push("preferencia_data");
  return falta;
}
