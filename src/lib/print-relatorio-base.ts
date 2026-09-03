/**
 * Estilo de impressão compartilhado pelos RELATÓRIOS em papel A4.
 *
 * Relatório é papel de conferência: quanto mais linhas couberem na folha,
 * menos papel a clínica gasta e mais fácil fica comparar tudo de uma vez.
 * O desenho antigo usava fonte e espaçamento de documento (recibo, contrato),
 * e por isso um relatório curto estourava para a segunda folha só para levar
 * o resumo final — que é justamente a parte que o financeiro precisa ver
 * junto do corpo da tabela.
 *
 * Este módulo concentra três decisões, para que todo relatório impresso saia
 * igual:
 *
 * 1. Compactação — fonte de 8,5pt no corpo da tabela e 3px de altura nas
 *    linhas, em vez do espaçamento largo de documento.
 * 2. Resumo inteiro — a tabela de resumo, o rodapé de totais e o bloco de
 *    assinaturas nunca são partidos ao meio pela quebra de página.
 * 3. Assinatura — espaço reservado no pé da folha para o carimbo/assinatura
 *    de quem confere o relatório.
 *
 * Os comprovantes (recibo, sangria, fechamento) continuam com o desenho
 * próprio de `print-doc-a4`: aquele papel é entregue ao paciente e precisa
 * ser grande e legível, não denso.
 */

import { esc } from "./print-doc-a4";

/** Uma linha de assinatura no pé do relatório. */
export type AssinaturaRelatorio = {
  /** Ex.: "Responsável Financeiro", "Médico / Profissional". */
  cargo: string;
  /** Nome impresso acima da linha, quando já se sabe quem assina. */
  nome?: string | null;
};

/**
 * Bloco de assinaturas — comum ao relatório em retrato e ao em paisagem.
 *
 * A altura é modesta de propósito (14mm até a linha): reservar meia folha
 * para a assinatura devolveria o problema da segunda página que a
 * compactação acabou de resolver.
 */
export const CSS_ASSINATURA_RELATORIO = `
  .assinaturas { display: flex; gap: 16mm; margin-top: 12mm;
    break-inside: avoid; page-break-inside: avoid; }
  .assinatura { flex: 1; text-align: center; }
  .assinatura .nome { font-size: 9pt; font-weight: 700; min-height: 11pt; }
  .assinatura .linha { border-top: 1px solid #18181b; margin-top: 14mm; }
  .assinatura .cargo { font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: .8px; color: #3f3f46; margin-top: 4px; }
  .assinatura .carimbo { font-size: 6.5pt; color: #a1a1aa; margin-top: 2px; }`;

/**
 * Monta o rodapé de assinaturas. Devolve string vazia quando o relatório não
 * é assinado — nem todo papel precisa de firma, e uma linha em branco solta
 * no pé da folha só confunde quem confere.
 */
export function blocoAssinaturasRelatorio(assinaturas?: AssinaturaRelatorio[]): string {
  if (!assinaturas?.length) return "";
  const campos = assinaturas
    .map(
      (a) => `
        <div class="assinatura">
          <div class="nome">${a.nome && a.nome.trim() ? esc(a.nome) : "&nbsp;"}</div>
          <div class="linha"></div>
          <div class="cargo">${esc(a.cargo)}</div>
          <div class="carimbo">Assinatura e carimbo</div>
        </div>`,
    )
    .join("");
  return `
      <div class="assinaturas">${campos}
      </div>`;
}

/**
 * Folha A4 em retrato para os relatórios de caixa e de movimentação.
 *
 * Substitui o CSS que estava escrito à mão dentro das telas — os dois
 * relatórios saíam com medidas ligeiramente diferentes, e nenhum dos dois
 * declarava `@page`, então a margem dependia do que estava configurado no
 * navegador de cada recepção.
 */
export const CSS_RELATORIO_A4 = `
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 9pt; }

  h1 { font-size: 12.5pt; margin: 0 0 5px; text-align: center; letter-spacing: .5px;
    text-transform: uppercase; }
  .meta { font-size: 8pt; color: #475569; margin-bottom: 6px; display: flex;
    justify-content: space-between; gap: 10px; flex-wrap: wrap; }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 10px; }
  thead { display: table-header-group; }
  th, td { padding: 3px 5px; border-bottom: 1px solid #cbd5e1; }
  thead th { border-bottom: 1.5px solid #0f172a; text-align: left; text-transform: uppercase;
    font-size: 7.5pt; letter-spacing: .4px; color: #334155; }
  thead th.n, td.n, .right { text-align: right; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
  tfoot { display: table-row-group; break-inside: avoid; page-break-inside: avoid; }
  tfoot td { border-top: 1.5px solid #0f172a; border-bottom: none; font-weight: 700; }

  /* O quadro de resumo é curto e só faz sentido inteiro: ou cabe nesta
   * página, ou desce inteiro para a próxima. */
  table.resumo, .resumo-bloco { break-inside: avoid; page-break-inside: avoid; }
${CSS_ASSINATURA_RELATORIO}

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }`;
