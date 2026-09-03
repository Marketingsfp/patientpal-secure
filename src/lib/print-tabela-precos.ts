/**
 * Impressão em A4 de uma tabela de preços (catálogo de serviços).
 *
 * Sai pela janela de impressão do navegador, como os demais relatórios do
 * sistema: quem quiser PDF usa "Salvar como PDF" no próprio diálogo, e quem
 * quiser papel manda direto para a impressora. Não gera arquivo — é uma folha
 * de consulta para ficar na bancada, não um documento para arquivar.
 *
 * A folha é pensada para leitura de relance no meio do atendimento: fonte
 * pequena mas com linhas zebradas, cabeçalho repetido a cada página
 * (`thead` + `display: table-header-group`) e valores alinhados à direita.
 */

export interface FolhaDePrecos {
  titulo: string;
  /** Linhas de contexto do topo: clínica, especialidade, data de emissão. */
  contexto: string[];
  cabecalhos: string[];
  linhas: string[][];
  /** Retrato até 4 colunas; acima disso a folha vira paisagem sozinha. */
  orientacao?: "retrato" | "paisagem";
}

const esc = (s: string) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

export function montarHtmlDaFolha(f: FolhaDePrecos): string {
  const orientacao = f.orientacao ?? (f.cabecalhos.length > 4 ? "paisagem" : "retrato");
  // A 1ª coluna é o nome do procedimento e fica à esquerda; todas as outras
  // são dinheiro e vão para a direita.
  const th = f.cabecalhos
    .map((c, i) => `<th class="${i === 0 ? "nome" : "num"}">${esc(c)}</th>`)
    .join("");
  const tr = f.linhas
    .map(
      (linha) =>
        "<tr>" +
        f.cabecalhos
          .map((_, i) => `<td class="${i === 0 ? "nome" : "num"}">${esc(linha[i] ?? "")}</td>`)
          .join("") +
        "</tr>",
    )
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(f.titulo)}</title>
<style>
  @page { size: A4 ${orientacao === "paisagem" ? "landscape" : "portrait"}; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2mm; }
  .contexto { font-size: 8.5pt; color: #444; margin-bottom: 4mm; }
  .contexto div { margin-bottom: 0.6mm; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  thead { display: table-header-group; }
  th, td { border: 0.4pt solid #b9c2cc; padding: 1.1mm 1.6mm; }
  th { background: #edf2f7; font-weight: 600; text-align: left; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  td.nome { width: 40%; }
  tbody tr:nth-child(even) td { background: #f7fafc; }
  tr { page-break-inside: avoid; }
  .rodape { margin-top: 4mm; font-size: 7.5pt; color: #666; }
</style></head><body>
<h1>${esc(f.titulo)}</h1>
<div class="contexto">${f.contexto.map((l) => `<div>${esc(l)}</div>`).join("")}</div>
<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
<div class="rodape">${f.linhas.length} procedimento(s). Valores sujeitos a alteração — confira sempre no sistema antes de fechar com o paciente.</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

/** Abre a folha na janela de impressão. Devolve false se o pop-up foi bloqueado. */
export function imprimirFolhaDePrecos(f: FolhaDePrecos): boolean {
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) return false;
  w.document.write(montarHtmlDaFolha(f));
  w.document.close();
  return true;
}
