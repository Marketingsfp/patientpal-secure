/**
 * Remarcação pela Maria (Etapa E2) — regras puras, sem rede.
 * Decisão de 03/10/2026: a Maria remarca sozinha até 2 horas antes do
 * horário marcado; com menos tempo, vai para a recepção. Cancelamento
 * continua SEMPRE com a recepção. Mesmo profissional e mesmo atendimento.
 */
export const FLAG_REMARCACAO_WHATSAPP = "nina_remarcacao_whatsapp";
export const ANTECEDENCIA_MINIMA_MS = 2 * 60 * 60 * 1000;
export const VALIDADE_PROPOSTA_MS = 30 * 60 * 1000;
export const MOTIVO_REMARCACAO_WHATSAPP = "Remarcado pelo paciente via WhatsApp";

export function motivoRemarcacao(teste: boolean): string {
  return teste ? `${MOTIVO_REMARCACAO_WHATSAPP} (homologação)` : MOTIVO_REMARCACAO_WHATSAPP;
}

/** true quando faltam 2 horas ou mais para o horário marcado. */
export function antecedenciaSuficiente(inicioIso: string, agora: Date = new Date()): boolean {
  const t = new Date(inicioIso).getTime();
  if (!Number.isFinite(t)) return false;
  return t - agora.getTime() >= ANTECEDENCIA_MINIMA_MS;
}

export const STATUS_NAO_REMARCAVEIS = new Set(["realizado", "cancelado", "faltou"]);

export type PropostaRemarcacao = {
  agendamento_id: string;
  novo_inicio: string;
  novo_fim: string;
  criado_em: string;
  expira_em: string;
};

/**
 * A troca só é gravada se a proposta foi mostrada num turno ANTERIOR (houve
 * uma resposta do paciente depois do resumo) e ainda está válida.
 */
export function confirmacaoPermitida(
  proposta: PropostaRemarcacao | null | undefined,
  turnoIniciadoEm: string | null | undefined,
  agora: Date = new Date(),
): { ok: true } | { ok: false; motivo: "SEM_PROPOSTA" | "MESMO_TURNO" | "EXPIRADA" } {
  if (!proposta) return { ok: false, motivo: "SEM_PROPOSTA" };
  const criado = new Date(proposta.criado_em).getTime();
  const turno = turnoIniciadoEm ? new Date(turnoIniciadoEm).getTime() : NaN;
  if (!Number.isFinite(turno) || !Number.isFinite(criado) || criado >= turno) return { ok: false, motivo: "MESMO_TURNO" };
  if (new Date(proposta.expira_em).getTime() <= agora.getTime()) return { ok: false, motivo: "EXPIRADA" };
  return { ok: true };
}

export function resumoRemarcacao(p: {
  profissional: string | null;
  procedimento: string | null;
  antigo: string;
  novo: string;
}): string {
  const quem = [p.procedimento, p.profissional ? `com ${p.profissional}` : null].filter(Boolean).join(" ");
  return `Confira a remarcação${quem ? ` de ${quem}` : ""}:\n• Horário atual: ${p.antigo}\n• Novo horário: ${p.novo}\nPosso confirmar a troca? Responda “sim” para remarcar.`;
}

export function blocoPromptRemarcacao(): string {
  return `REMARCAÇÃO — ESTA REGRA SUBSTITUI A PARTE DE REMARCAÇÃO DA INSTRUÇÃO OP-04:
- Você PODE remarcar um agendamento do próprio paciente, para o MESMO profissional e o MESMO atendimento, até 2 horas antes do horário marcado.
- Passos: (1) paciente identificado; (2) "meus_agendamentos" e o paciente indica qual; (3) "consultar_disponibilidade" do mesmo profissional; (4) paciente escolhe; (5) "propor_remarcacao" e envie o resumo devolvido; (6) só depois do "sim" do paciente, em outra mensagem, chame "remarcar_agendamento".
- Só diga "remarcado" depois que "remarcar_agendamento" devolver "ok": true. Se falhar, diga que o horário antigo continua valendo.
- Faltando menos de 2 horas, outro profissional, outro atendimento ou agendamento não confirmado: encaminhe à recepção.
- CANCELAMENTO continua sempre com a recepção: você nunca cancela.`;
}
