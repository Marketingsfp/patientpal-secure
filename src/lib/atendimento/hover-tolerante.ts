/**
 * Hover tolerante para os painéis retráteis do atendimento.
 *
 * Problema corrigido: com `onMouseLeave` puro, arrastar a barra de rolagem do
 * painel fechava a coluna assim que o cursor passava alguns pixels da borda.
 *
 * Regras:
 *  - zona invisível de tolerância ao redor do painel (maior à direita, onde
 *    fica a scrollbar) — é apenas cálculo de coordenadas, nenhuma div por cima,
 *    então nada bloqueia cliques na conversa;
 *  - atraso antes de recolher, cancelado se o cursor voltar;
 *  - enquanto houver arrasto iniciado dentro do painel (scrollbar inclusive),
 *    o recolhimento é ignorado até `pointerup`/`pointercancel`, mesmo fora.
 */

export type Retangulo = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ToleranciaHover = {
  /** Tolerância à direita (lado da scrollbar / da conversa). */
  direita: number;
  /** Tolerância nas demais bordas. */
  demais: number;
};

export const TOLERANCIA_PADRAO: ToleranciaHover = { direita: 32, demais: 16 };
export const DELAY_RECOLHER_MS = 500;

/** O ponto está dentro do painel considerando a zona invisível de tolerância? */
export function dentroComTolerancia(
  rect: Retangulo,
  x: number,
  y: number,
  tol: ToleranciaHover = TOLERANCIA_PADRAO,
): boolean {
  return (
    x >= rect.left - tol.demais &&
    x <= rect.right + tol.direita &&
    y >= rect.top - tol.demais &&
    y <= rect.bottom + tol.demais
  );
}
