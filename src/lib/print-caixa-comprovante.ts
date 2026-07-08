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
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .page { padding: 18mm 16mm; max-width: 190mm; margin: 0 auto; }
  .via { border: 1px dashed #94a3b8; padding: 10mm; border-radius: 6px; margin-bottom: 8mm; }
  .via + .via { margin-top: 0; }
  .via-label { font-size: 10px; letter-spacing: 2px; color: #64748b;
    text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px; }
  .clinica { font-weight: 800; font-size: 14px; }
  .titulo { font-size: 15px; font-weight: 800; margin: 4px 0 2px; }
  .subtitulo { font-size: 11px; color: #475569; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;
    font-size: 11px; margin: 8px 0 10px; }
  .meta b { color: #0f172a; }
  .valores { border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;
    padding: 6px 0; margin: 6px 0 10px; }
  .linha { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .linha.destaque { font-weight: 800; font-size: 14px; }
  .desc { font-size: 11px; color: #334155; margin: 6px 0 10px; white-space: pre-wrap; }
  .desc b { color: #0f172a; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  .sig { text-align: center; }
  .sig .line { border-top: 1px solid #0f172a; margin-top: 34px; padding-top: 4px;
    font-size: 10px; color: #334155; text-transform: uppercase; letter-spacing: 1px; }
  .sig .nome { font-size: 11px; color: #0f172a; font-weight: 700; }
  .rodape { font-size: 9px; color: #64748b; margin-top: 10px; text-align: center; }
  @media print {
    @page { size: A4; margin: 0; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
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
  ${["1ª VIA — CAIXA", "2ª VIA — TESOURARIA"].map((viaLabel) => `
    <div class="via">
      <div class="via-label">${viaLabel}</div>
      <div class="header">
        <div>
          <div class="clinica">${esc(input.clinicaNome)}</div>
          <div class="titulo">${esc(TITULOS[input.tipo])}</div>
          <div class="subtitulo">${esc(SUBTITULOS[input.tipo])}</div>
        </div>
        <div style="text-align:right; font-size:11px; color:#334155;">
          <div><b>Data/Hora</b></div>
          <div>${esc(dtStr)}</div>
        </div>
      </div>
      <div class="meta">
        <div><b>Operador (Atendente):</b> ${esc(input.operadorNome)}</div>
        <div><b>Tipo:</b> ${esc(TITULOS[input.tipo].replace("COMPROVANTE DE ", ""))}</div>
      </div>
      <div class="valores">
        ${linhas.map((l) => `
          <div class="linha ${l.destaque ? "destaque" : ""}">
            <span>${esc(l.label)}</span>
            <span>${esc(l.valor)}</span>
          </div>`).join("")}
      </div>
      ${input.descricao ? `<div class="desc"><b>Descrição / motivo:</b><br/>${esc(input.descricao)}</div>` : ""}
      <div class="sigs">
        <div class="sig">
          <div class="line">Assinatura do Atendente</div>
          <div class="nome">${esc(input.operadorNome)}</div>
        </div>
        <div class="sig">
          <div class="line">Assinatura da Tesouraria</div>
          <div class="nome">&nbsp;</div>
        </div>
      </div>
      <div class="rodape">Documento gerado em ${esc(dtStr)} — ClinicaOS</div>
    </div>
  `).join("")}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
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