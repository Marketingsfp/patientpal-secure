import type { ResultadoBroker } from "./tool-broker";
import { FERRAMENTAS_DE_VAGAS } from "./consulta-agenda";

/** Erro de execução não é evidência de catálogo ausente nem de agenda vazia. */
export function encaminhamentoFalhaAgendamento(r: ResultadoBroker) {
  if (r.success || !r.erro) return null;
  const d = r.dados as Record<string, unknown> | null;
  const acao = ["selecionar_horario", "identificar_paciente", "agendar"].includes(r.ferramenta);
  const tecnica = [
    "INTERNAL_ERROR",
    "ACTION_NOT_AUTHORIZED",
    "PATIENT_NOT_VERIFIED",
    "VALIDATION_ERROR",
  ].includes(r.erro);
  if (!(acao || FERRAMENTAS_DE_VAGAS.has(r.ferramenta)) || !tecnica) return null;
  return {
    motivo: `FALHA_OPERACIONAL_AGENDAMENTO: ${r.ferramenta} (${d?.codigo ?? r.erro})`,
    resumo: `Não foi possível concluir a etapa ${r.ferramenta}. Código: ${d?.codigo ?? r.erro}. ${String(d?.mensagem ?? "").slice(0, 500)} A equipe deve conferir o atendimento e a agenda antes de continuar. A falha não comprova falta de vagas nem ausência do atendimento na base. Confira eventuais reservas antes de repetir a operação.`,
    urgencia: "normal" as const,
    setor: "Agendamento",
  };
}

export function respostaFalhaAgendamento(confirmado: boolean) {
  return confirmado
    ? "Não consegui concluir seu agendamento neste momento. Encaminhei sua conversa para nossa equipe conferir e continuar o atendimento por aqui."
    : "Não consegui concluir seu agendamento nem confirmar o encaminhamento neste momento. Por favor, entre em contato com a recepção para conferir o atendimento.";
}
