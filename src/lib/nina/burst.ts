/**
 * FASE 2 — Message Burst Aggregation (configuração e regras puras).
 *
 * Quando o paciente escreve em partes ("Olá" / "Quero marcar" / "Neurologista"),
 * cada mensagem continua sendo persistida e exibida imediatamente. O que este
 * módulo faz é apenas AGRUPAR essas mensagens em UM turno lógico para a Nina,
 * evitando várias execuções concorrentes do modelo.
 *
 * Regra determinística de infraestrutura: NÃO altera prompt, comportamento,
 * ferramentas ou decisões da Nina.
 */

/** Silêncio necessário para fechar o lote. */
export const QUIET_WINDOW_MS = 1000;

/** Tempo máximo que um lote pode ficar aberto, mesmo com mensagens seguidas. */
export const MAX_BURST_WINDOW_MS = 2500;

export type StatusLoteNina = "COLLECTING" | "PROCESSING" | "PROCESSED" | "SUPERSEDED";

export type DecisaoEspera = {
  /** Quanto esta invocação deve aguardar antes de tentar assumir o lote. */
  esperaMs: number;
  /**
   * Quando o teto de burst é atingido, o lote é assumido mesmo que novas
   * mensagens tenham chegado — nada fica pendente indefinidamente.
   */
  forcar: boolean;
};

/**
 * Decide a espera desta invocação: quiet window renovada a cada mensagem,
 * limitada pelo teto contado desde a primeira mensagem do lote.
 */
export function decidirEspera(
  agoraMs: number,
  primeiraMensagemMs: number,
  cfg: { quietMs?: number; maxMs?: number } = {},
): DecisaoEspera {
  const quiet = cfg.quietMs ?? QUIET_WINDOW_MS;
  const max = cfg.maxMs ?? MAX_BURST_WINDOW_MS;
  const decorrido = Math.max(0, agoraMs - primeiraMensagemMs);
  const restante = Math.max(0, max - decorrido);
  if (restante <= quiet) return { esperaMs: restante, forcar: true };
  return { esperaMs: quiet, forcar: false };
}

/**
 * Monta o turno lógico enviado ao modelo. Mensagens distintas permanecem
 * distintas e ordenadas — nunca coladas palavra a palavra.
 */
export function montarTurnoPaciente(mensagens: string[]): string {
  const limpas = mensagens.map((m) => (m ?? "").trim()).filter(Boolean);
  if (limpas.length <= 1) return limpas[0] ?? "";
  const lista = limpas.map((m, i) => `${i + 1}. ${m}`).join("\n");
  return `MENSAGENS RECENTES DO PACIENTE NESTE TURNO:\n${lista}`;
}
