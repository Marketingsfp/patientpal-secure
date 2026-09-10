/**
 * FASE 4 — Stale Response Guard (regras puras).
 *
 * A revisão da conversa é um contador monotônico: cada mensagem nova do
 * paciente incrementa. Uma resposta só pode ser enviada se a revisão que ela
 * processou continuar sendo a revisão atual da conversa.
 */

/** Ferramentas que mudam estado real e exigem revisão atual antes de rodar. */
export const FERRAMENTAS_CRITICAS = new Set([
  "agendar",
  "criar_agendamento",
  "cancelar_agendamento",
  "cancelar",
  "remarcar_agendamento",
  "remarcar",
  "transferir",
  "solicitar_atendente_humano",
]);

export function ehFerramentaCritica(nome: string): boolean {
  return FERRAMENTAS_CRITICAS.has(String(nome ?? "").trim());
}

/**
 * `true` quando a geração ficou para trás: chegou mensagem nova enquanto o
 * modelo trabalhava. Revisão desconhecida (0/null) nunca invalida — ausência
 * de informação não é prova de obsolescência.
 */
export function estaObsoleta(
  processada: number | null | undefined,
  atual: number | null | undefined,
): boolean {
  if (!processada || !atual) return false;
  return atual !== processada;
}

export type MotivoDescartada = "SUPERSEDED";

export function decidirEnvio(input: {
  processada: number | null | undefined;
  atual: number | null | undefined;
}): { enviar: boolean; motivo?: MotivoDescartada } {
  return estaObsoleta(input.processada, input.atual)
    ? { enviar: false, motivo: "SUPERSEDED" }
    : { enviar: true };
}
