import type { EstadoFluxoNina } from "../fluxo-estado-normalizar";
import { chaveConfirmacaoModalidade, permiteReserva } from "../modalidade-atendimento";
import { criarResultado } from "./contrato";
import { textoDaChave, type TextosTemplates } from "./templates";

/** Gate e caminho do modelo entregam os mesmos dados comprovados da reserva. */
export function resultadoAgendamentoConfirmado(
  dados: Record<string, unknown>, estado: EstadoFluxoNina, unidade: string,
  textos?: TextosTemplates | null, conversaId?: string | null,
) {
  const a = estado.appointment;
  const modalidade = dados.modalidade_atendimento ?? a.modalidade_atendimento;
  if (!permiteReserva(modalidade)) return null;
  const id = typeof dados.appointment_id === "string" ? dados.appointment_id : a.appointment_id;
  if (!id) return null;
  const ficha = typeof dados.ficha_numero === "string" ? dados.ficha_numero : null;
  const chave = chaveConfirmacaoModalidade(modalidade, ficha);
  const variaveis = { profissional: String(dados.medico ?? a.doctor_name ?? "-"),
    data: String(dados.date ?? a.date?.split("-").reverse().join("/") ?? "-"),
    horario: String(dados.time ?? a.time ?? "-"), unidade: unidade.trim() || "nossa clínica",
    modalidade, ficha: ficha ?? "" };
  return criarResultado({ origem: "gate", chaveTemplate: chave, variaveis,
    texto: textoDaChave(chave, variaveis, textos).texto,
    fatosConfirmados: ["agendamento_gravado", `modalidade:${modalidade}`],
    acoesConcluidas: [{ acao: "agendar", idempotencia: `agendar|${conversaId}|${a.slot_inicio ?? ""}`,
      confirmada: true, evidencia: id }],
  });
}
