/**
 * Folha A4 compartilhada pelos comprovantes financeiros impressos
 * (recibo de lançamento, sangria, suprimento, estorno, fechamento de caixa).
 *
 * Existe para que todo papel que sai do sistema tenha o mesmo desenho — o
 * layout antigo era de bobina térmica de 72mm e, numa impressora A4, saía
 * como um cupom minúsculo no canto da folha. As classes abaixo são usadas
 * pelos módulos `print-recibo-lancamento` e `print-caixa-comprovante`.
 */

export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Estilos da folha A4. Fontes em `pt` para o tamanho no papel ser previsível. */
export const CSS_DOC_A4 = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f4f4f5; color: #18181b;
    font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif; }
  .folha { max-width: 190mm; margin: 0 auto; padding: 10mm 6mm; }
  .doc { background: #fff; border: 1px solid #d4d4d8; border-radius: 10px; padding: 12mm 12mm 10mm; }

  header { display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; border-bottom: 2px solid #18181b; padding-bottom: 10px; }
  .clinica { font-size: 21pt; font-weight: 800; line-height: 1.15;
    text-transform: uppercase; letter-spacing: .2px; }
  .sub { font-size: 10.5pt; color: #52525b; margin-top: 3px; }
  .selo { flex: none; font-size: 10pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .6px; padding: 5px 12px; border-radius: 999px; border: 1.5px solid #18181b; }
  .selo.receita { color: #14532d; border-color: #14532d; background: #f0fdf4; }
  .selo.despesa { color: #7f1d1d; border-color: #7f1d1d; background: #fef2f2; }
  .selo.neutro { color: #1e3a8a; border-color: #1e3a8a; background: #eff6ff; }

  .titulo { text-align: center; font-size: 16pt; font-weight: 800; letter-spacing: 2px;
    text-transform: uppercase; margin: 16px 0 12px; }

  .valor-box { border: 1.5px solid #18181b; border-radius: 8px; background: #fafafa;
    text-align: center; padding: 12px 14px; margin-bottom: 16px; }
  .valor-box .rot { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #52525b; }
  .valor-box .valor { font-size: 34pt; font-weight: 800; line-height: 1.1; margin-top: 2px; }
  .valor-box .extenso { font-size: 11pt; color: #3f3f46; margin-top: 4px; font-style: italic; }

  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin-bottom: 4px; }
  .campo { border-bottom: 1px dotted #a1a1aa; padding-bottom: 5px; }
  .campo.largo { grid-column: 1 / -1; }
  .campo .rot { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: #52525b; }
  .campo .val { font-size: 13pt; font-weight: 600; line-height: 1.3; word-break: break-word; }

  .bloco { margin-top: 12px; border: 1px solid #e4e4e7; border-radius: 8px; padding: 10px 12px; }
  .bloco .rot { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: #52525b; }
  .bloco .texto { font-size: 12.5pt; line-height: 1.5; margin-top: 3px;
    white-space: pre-wrap; word-break: break-word; }

  .secao { margin-top: 16px; }
  .secao > .rot { font-size: 9.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.2px; color: #3f3f46; border-bottom: 1.5px solid #18181b; padding-bottom: 4px; }

  .linha-val { display: flex; justify-content: space-between; align-items: baseline; gap: 14px;
    font-size: 12.5pt; padding: 6px 0; border-bottom: 1px dotted #a1a1aa; }
  .linha-val .k { color: #3f3f46; }
  .linha-val .v { font-weight: 600; white-space: nowrap; }
  .linha-val.destaque { font-size: 15pt; }
  .linha-val.destaque .k, .linha-val.destaque .v { font-weight: 800; }
  .linha-val.total { border-bottom: none; border-top: 1.5px solid #18181b; }
  .linha-val.total .k, .linha-val.total .v { font-weight: 800; }
  .linha-val .desc { font-size: 10.5pt; color: #52525b; }

  .assinaturas { display: flex; gap: 26px; margin-top: 30px; }
  .assinatura { flex: 1; text-align: center; }
  .assinatura .nome { font-size: 11.5pt; font-weight: 700; min-height: 16pt; }
  .assinatura .linha { border-top: 1.5px solid #18181b; margin-top: 26px; }
  .assinatura .cargo { font-size: 9pt; text-transform: uppercase; letter-spacing: 1px;
    color: #3f3f46; margin-top: 5px; }

  .rodape { text-align: center; font-size: 8.5pt; color: #71717a; margin-top: 18px;
    border-top: 1px solid #e4e4e7; padding-top: 8px; }

  .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 8px; }
  .toolbar button { background: #1d4ed8; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 6px; cursor: pointer; font-weight: 600; font-family: inherit; }
  .toolbar button.sec { background: #e2e8f0; color: #0f172a; }

  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
    html { background: #fff; }
    .folha { max-width: none; margin: 0; padding: 0; }
    .doc { border: none; border-radius: 0; padding: 0; }
    .doc, .assinaturas, .bloco, .secao { break-inside: avoid; page-break-inside: avoid; }
    .no-print, .toolbar { display: none !important; visibility: hidden !important; }
  }`;

/** Estilos mínimos da barra de botões na versão bobina (que tem CSS próprio). */
export const CSS_TOOLBAR_80MM = `
  .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 8px; }
  .toolbar button { background: #1d4ed8; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 6px; cursor: pointer; font-weight: 600; font-family: inherit; }
  .toolbar button.sec { background: #e2e8f0; color: #0f172a; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print, .toolbar { display: none !important; visibility: hidden !important; }
  }`;

/** Cabeçalho padrão: nome da clínica, linha de apoio e selo do tipo de papel. */
export const headerA4 = (
  clinicaNome: string,
  subtitulo: string,
  selo?: { texto: string; cor: "receita" | "despesa" | "neutro" },
) => `
      <header>
        <div class="marca">
          <div class="clinica">${esc(clinicaNome)}</div>
          <div class="sub">${esc(subtitulo)}</div>
        </div>
        ${selo ? `<div class="selo ${selo.cor}">${esc(selo.texto)}</div>` : ""}
      </header>`;

/** Campo rotulado da grade de duas colunas. */
export const campoA4 = (rotulo: string, valor: string, largo = false) => `
        <div class="campo${largo ? " largo" : ""}">
          <div class="rot">${esc(rotulo)}</div>
          <div class="val">${esc(valor)}</div>
        </div>`;

/** Linha "rótulo à esquerda, valor à direita" usada nas seções de totais. */
export const linhaValorA4 = (
  rotulo: string,
  valor: string,
  opts?: { destaque?: boolean; total?: boolean; descricao?: string | null },
) => `
        <div class="linha-val${opts?.destaque ? " destaque" : ""}${opts?.total ? " total" : ""}">
          <span class="k">${esc(rotulo)}${opts?.descricao ? `<br/><span class="desc">${esc(opts.descricao)}</span>` : ""}</span>
          <span class="v">${esc(valor)}</span>
        </div>`;

/** Bloco de assinatura com o nome impresso acima da linha. */
export const assinaturaA4 = (cargo: string, nome?: string | null) => `
        <div class="assinatura">
          <div class="nome">${nome && nome.trim() ? esc(nome) : "&nbsp;"}</div>
          <div class="linha"></div>
          <div class="cargo">${esc(cargo)}</div>
        </div>`;

/** Documento completo: `<html>` com a barra de botões e o corpo já montado. */
export const documentoA4 = (titulo: string, corpo: string, css = CSS_DOC_A4) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>${css}</style></head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Imprimir</button>
    <button class="sec" onclick="window.close()">Fechar</button>
  </div>
${corpo}
</body></html>`;
