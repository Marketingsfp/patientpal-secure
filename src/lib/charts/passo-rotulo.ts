/**
 * De quantas em quantas barras o eixo X de um gráfico recebe rótulo.
 *
 * Existe porque o BI Financeiro passou a poder mostrar um dia por barra: com
 * 30 dias no mês, os textos "01/09", "02/09"... ficavam encavalados e
 * ilegíveis. Em vez de rodar o texto na diagonal — que fica ruim de ler numa
 * tela de recepção e não resolve em tela estreita —, o eixo escreve um rótulo
 * a cada N barras, sendo N o mínimo para os textos não se tocarem.
 *
 * É código puro, separado de `@/components/charts/MiniBarChart`, porque a
 * suíte de testes (`bun test`) não monta React e esta é justamente a conta
 * que pode voltar a errar quando alguém mexer no tamanho da fonte.
 */

/**
 * Largura aproximada, em pixels, de um caractere a 11px na fonte do sistema.
 * Medida grosseira e de propósito generosa: errar para mais só faz o eixo
 * pular um rótulo a mais, errar para menos volta a encavalar o texto.
 */
export const CHAR_PX = 6.2;

/** Respiro mínimo entre dois rótulos vizinhos, em pixels. */
const FOLGA_PX = 8;

/**
 * @param labels Os rótulos do eixo, na ordem em que aparecem.
 * @param larguraPorBarra Quantos pixels cada barra (ou grupo de barras) ocupa.
 * @returns 1 quando todos os rótulos cabem; 2 para escrever um a cada dois, e
 *          assim por diante.
 */
export function passoDoRotulo(labels: string[], larguraPorBarra: number): number {
  if (!Number.isFinite(larguraPorBarra) || larguraPorBarra <= 0) return 1;
  const maiorRotulo = labels.reduce((m, l) => Math.max(m, String(l ?? "").length), 0);
  if (maiorRotulo === 0) return 1;
  return Math.max(1, Math.ceil((maiorRotulo * CHAR_PX + FOLGA_PX) / larguraPorBarra));
}
