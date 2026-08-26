/**
 * Impressão em papel do relatório de Financeiro > Relatórios.
 *
 * A tela lista os dados numa tabela e este módulo transforma a MESMA tabela
 * (mesmas colunas, mesma ordem, mesmos totais) numa folha A4 deitada — tabela
 * de relatório tem muitas colunas e, em retrato, as colunas de valor ficavam
 * espremidas contra a margem.
 *
 * O cabeçalho da tabela é repetido em toda página (`thead` como
 * `table-header-group`) para que a segunda folha em diante continue legível,
 * e a linha de totais nunca se separa do corpo.
 */

import { esc, headerA4 } from "./print-doc-a4";
import { printHtmlViaIframe } from "./print-html";

/** Uma coluna da tabela impressa, já com o valor formatado pela tela. */
export type ColunaImpressa = {
  rotulo: string;
  /** Alinhamento à direita para dinheiro e números. */
  numerica?: boolean;
};

export type RelatorioImpresso = {
  clinicaNome: string;
  /** Ex.: "Lançamentos" — vira o título do documento. */
  titulo: string;
  /** Ex.: "01/07/2026 a 26/08/2026". */
  periodo: string;
  colunas: ColunaImpressa[];
  /** Linhas já formatadas em texto, na mesma ordem das colunas. */
  linhas: string[][];
  /** Rodapé da tabela: uma célula por coluna ("" onde não há total). */
  totais: string[];
  /** Linhas de resumo mostradas abaixo da tabela (ex.: receitas x despesas). */
  resumo?: { rotulo: string; valor: string }[];
};

const CSS_RELATORIO = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f4f4f5; color: #18181b;
    font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; }
  .folha { max-width: 280mm; margin: 0 auto; padding: 8mm 6mm; }
  .doc { background: #fff; border: 1px solid #d4d4d8; border-radius: 10px; padding: 10mm; }

  header { display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; border-bottom: 2px solid #18181b; padding-bottom: 8px; }
  .clinica { font-size: 18pt; font-weight: 800; line-height: 1.15;
    text-transform: uppercase; letter-spacing: .2px; }
  .sub { font-size: 10pt; color: #52525b; margin-top: 3px; }
  .selo { flex: none; font-size: 9.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .6px; padding: 5px 12px; border-radius: 999px; border: 1.5px solid #1e3a8a;
    color: #1e3a8a; background: #eff6ff; }

  .titulo { text-align: center; font-size: 14pt; font-weight: 800; letter-spacing: 2px;
    text-transform: uppercase; margin: 12px 0 10px; }

  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead { display: table-header-group; }
  tfoot { display: table-row-group; }
  th { text-align: left; text-transform: uppercase; letter-spacing: .5px; font-size: 7.5pt;
    color: #3f3f46; background: #f4f4f5; border-bottom: 1.5px solid #18181b;
    padding: 6px 5px; }
  td { padding: 5px; border-bottom: 1px solid #e4e4e7; vertical-align: top;
    word-break: break-word; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  tfoot td { border-top: 1.5px solid #18181b; border-bottom: none;
    font-weight: 800; font-size: 9pt; padding-top: 7px; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  .resumo { margin-top: 14px; margin-left: auto; width: 90mm; }
  .resumo .linha { display: flex; justify-content: space-between; align-items: baseline;
    gap: 14px; font-size: 10.5pt; padding: 5px 0; border-bottom: 1px dotted #a1a1aa; }
  .resumo .linha:last-child { border-bottom: none; border-top: 1.5px solid #18181b;
    font-weight: 800; }
  .resumo .v { font-weight: 600; white-space: nowrap; }

  .vazio { text-align: center; font-size: 11pt; color: #52525b; padding: 20px 0; }

  .rodape { text-align: center; font-size: 8pt; color: #71717a; margin-top: 16px;
    border-top: 1px solid #e4e4e7; padding-top: 7px; }

  @media print {
    @page { size: A4 landscape; margin: 8mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
    html { background: #fff; }
    .folha { max-width: none; margin: 0; padding: 0; }
    .doc { border: none; border-radius: 0; padding: 0; }
    .resumo { break-inside: avoid; page-break-inside: avoid; }
  }`;

const agora = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Monta o HTML da folha — exportado para poder ser testado sem imprimir. */
export function montarRelatorioHtml(r: RelatorioImpresso): string {
  const cls = (c: ColunaImpressa) => (c.numerica ? ' class="num"' : "");

  const cabecalho = r.colunas.map((c) => `<th${cls(c)}>${esc(c.rotulo)}</th>`).join("");

  const corpo = r.linhas.length
    ? r.linhas
        .map(
          (linha) =>
            `<tr>${r.colunas
              .map((c, i) => `<td${cls(c)}>${esc(linha[i] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td class="vazio" colspan="${r.colunas.length}">Nenhum registro no período.</td></tr>`;

  const rodapeTabela = `<tr>${r.colunas
    .map((c, i) => `<td${cls(c)}>${esc(r.totais[i] ?? "")}</td>`)
    .join("")}</tr>`;

  const resumo = r.resumo?.length
    ? `<div class="resumo">${r.resumo
        .map(
          (l) =>
            `<div class="linha"><span class="k">${esc(l.rotulo)}</span><span class="v">${esc(l.valor)}</span></div>`,
        )
        .join("")}</div>`
    : "";

  const corpoDoc = `
  <div class="folha">
    <div class="doc">
${headerA4(r.clinicaNome, `Relatório do período ${r.periodo}`, { texto: "Relatório", cor: "neutro" })}
      <div class="titulo">${esc(r.titulo)}</div>
      <table>
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot>${rodapeTabela}</tfoot>
      </table>
      ${resumo}
      <div class="rodape">Emitido em ${esc(agora())} — ${esc(r.linhas.length.toLocaleString("pt-BR"))} registro(s)</div>
    </div>
  </div>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${esc(r.titulo)} — ${esc(r.periodo)}</title>
<style>${CSS_RELATORIO}</style></head>
<body>
${corpoDoc}
</body></html>`;
}

/** Abre o diálogo de impressão do navegador com o relatório montado. */
export function imprimirRelatorio(r: RelatorioImpresso) {
  printHtmlViaIframe(montarRelatorioHtml(r));
}
