/**
 * Comprovante impresso de movimentação de caixa (Sangria, Suprimento,
 * Fechamento). Contém data/hora, valores e duas linhas de assinatura:
 * Atendente e Tesouraria. Abre a janela de impressão automaticamente.
 */

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDT = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export type ComprovanteCaixaTipo = "sangria" | "suprimento" | "fechamento";

export interface ComprovanteCaixaInput {
  tipo: ComprovanteCaixaTipo;
  clinicaNome: string;
  operadorNome: string;
  valor: number;
  descricao?: string | null;
  /** Preenchidos somente no fechamento. */
  saldoCalculado?: number;
  valorInformado?: number;
  diferenca?: number;
  /** Data/hora do movimento (default: agora). */
  quando?: Date;
}

const TITULOS: Record<ComprovanteCaixaTipo, string> = {
  sangria: "COMPROVANTE DE SANGRIA",
  suprimento: "COMPROVANTE DE SUPRIMENTO",
  fechamento: "COMPROVANTE DE FECHAMENTO DE CAIXA",
};

const SUBTITULOS: Record<ComprovanteCaixaTipo, string> = {
  sangria: "Retirada de dinheiro do caixa",
  suprimento: "Adição de dinheiro ao caixa",
  fechamento: "Conferência e encerramento do caixa",
};

export function printComprovanteCaixa(input: ComprovanteCaixaInput) {
  const quando = input.quando ?? new Date();
  const dtStr = fmtDT(quando);
  const isFech = input.tipo === "fechamento";

  const linhas: Array<{ label: string; valor: string; destaque?: boolean }> = [];
  if (isFech) {
    linhas.push({ label: "Saldo calculado pelo sistema", valor: fmtBRL(input.saldoCalculado ?? 0) });
    linhas.push({ label: "Valor conferido em caixa", valor: fmtBRL(input.valorInformado ?? input.valor) });
    const dif = Number(input.diferenca ?? 0);
    linhas.push({
      label: "Diferença",
      valor: (dif >= 0 ? "" : "") + fmtBRL(dif),
      destaque: Math.abs(dif) > 0.009,
    });
  } else {
    linhas.push({ label: "Valor", valor: fmtBRL(input.valor), destaque: true });
  }

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${esc(TITULOS[input.tipo])}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    font-family: "Consolas", "Menlo", "Courier New", ui-monospace, monospace; }
  .receipt { width: 72mm; padding: 3mm 3mm 6mm; margin: 0 auto; font-size: 11px; line-height: 1.35; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .clinica { font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .titulo { font-size: 12px; font-weight: 800; margin-top: 2px; text-transform: uppercase; }
  .subtitulo { font-size: 10px; margin-bottom: 4px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row .k { text-transform: uppercase; font-size: 10px; }
  .row .v { text-align: right; word-break: break-word; }
  .valor-destaque { font-size: 15px; font-weight: 800; text-align: center; margin: 4px 0; }
  .desc { font-size: 10px; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
  .sig { margin-top: 14px; }
  .sig .line { border-top: 1px solid #000; margin-top: 22px; padding-top: 2px;
    font-size: 9px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
  .sig .nome { font-size: 10px; text-align: center; font-weight: 700; min-height: 12px; }
  .rodape { font-size: 9px; margin-top: 8px; text-align: center; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
    .receipt { width: 72mm; }
  }
  .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 8px; }
  .toolbar button { background: #1d4ed8; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 6px; cursor: pointer; font-weight: 600; }
  .toolbar button.sec { background: #e2e8f0; color: #0f172a; }
</style></head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Imprimir</button>
    <button class="sec" onclick="window.close()">Fechar</button>
  </div>
  <div class="receipt">
    <div class="center clinica">${esc(input.clinicaNome)}</div>
    <div class="center titulo">${esc(TITULOS[input.tipo])}</div>
    <div class="center subtitulo">${esc(SUBTITULOS[input.tipo])}</div>
    <div class="sep"></div>
    <div class="row"><span class="k">Data/Hora</span><span class="v">${esc(dtStr)}</span></div>
    <div class="row"><span class="k">Atendente</span><span class="v">${esc(input.operadorNome)}</span></div>
    <div class="sep"></div>
    ${isFech
      ? linhas.map((l) => `<div class="row"><span class="k">${esc(l.label)}</span><span class="v ${l.destaque ? "bold" : ""}">${esc(l.valor)}</span></div>`).join("")
      : `<div class="valor-destaque">${esc(fmtBRL(input.valor))}</div>`
    }
    ${input.descricao ? `<div class="sep"></div><div class="desc"><b>Descrição:</b> ${esc(input.descricao)}</div>` : ""}
    <div class="sep"></div>
    <div class="sig">
      <div class="nome">${esc(input.operadorNome)}</div>
      <div class="line">Assinatura do Atendente</div>
    </div>
    <div class="sig">
      <div class="nome">&nbsp;</div>
      <div class="line">Assinatura da Tesouraria</div>
    </div>
    <div class="rodape">${esc(dtStr)} — ClinicaOS</div>
  </div>
</body></html>`;

  // Usa iframe oculto para evitar bloqueio de pop-up (o handler é async e
  // window.open após await perde o "user gesture" em muitos navegadores).
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* noop */ }
    }, 1000);
  };

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) { cleanup(); return; }
  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch { /* noop */ }
    // Após diálogo de impressão fechar, removemos o iframe.
    const onAfter = () => { cleanup(); win.removeEventListener("afterprint", onAfter); };
    win.addEventListener("afterprint", onAfter);
    // fallback: garante limpeza mesmo sem afterprint
    setTimeout(cleanup, 60000);
  };

  if (doc.readyState === "complete") {
    setTimeout(triggerPrint, 100);
  } else {
    iframe.addEventListener("load", () => setTimeout(triggerPrint, 100), { once: true });
  }
}