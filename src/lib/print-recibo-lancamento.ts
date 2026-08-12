/**
 * Recibo impresso de um lançamento financeiro (Nova Receita / Nova Despesa).
 * Usado pelo botão "Salvar e imprimir" quando a tela chamadora não possui
 * um fluxo de impressão próprio (guia de atendimento, carnê, etc.).
 * Abre a impressão via iframe oculto para não sofrer bloqueio de pop-up.
 */

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDT = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Converte "2026-08-12" em "12/08/2026" sem sofrer deslocamento de fuso. */
const fmtDataISO = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [aaaa, mm, dd] = iso.slice(0, 10).split("-");
  return aaaa && mm && dd ? `${dd}/${mm}/${aaaa}` : iso;
};

export interface ReciboLancamentoInput {
  tipo: "receita" | "despesa";
  clinicaNome: string;
  operadorNome?: string | null;
  pacienteNome?: string | null;
  descricao: string;
  valor: number;
  /** Data do lançamento em ISO (YYYY-MM-DD). */
  data: string;
  categoriaNome?: string | null;
  contaNome?: string | null;
  formaPagamentoLabel?: string | null;
  observacoes?: string | null;
}

export function printReciboLancamento(input: ReciboLancamentoInput) {
  const agora = new Date();
  const titulo = input.tipo === "receita" ? "RECIBO DE PAGAMENTO" : "COMPROVANTE DE DESPESA";

  const linhas: Array<[string, string | null | undefined]> = [
    ["Data", fmtDataISO(input.data)],
    ["Paciente", input.pacienteNome],
    ["Categoria", input.categoriaNome],
    ["Forma pgto", input.formaPagamentoLabel],
    ["Conta", input.contaNome],
    ["Atendente", input.operadorNome],
  ];

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    font-family: "Consolas", "Menlo", "Courier New", ui-monospace, monospace; }
  .receipt { width: 72mm; padding: 3mm 3mm 6mm; margin: 0 auto; font-size: 11px; line-height: 1.35; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .clinica { font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .titulo { font-size: 12px; font-weight: 800; margin-top: 2px; text-transform: uppercase; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row .k { text-transform: uppercase; font-size: 10px; }
  .row .v { text-align: right; word-break: break-word; }
  .valor-destaque { font-size: 15px; font-weight: 800; text-align: center; margin: 4px 0; }
  .desc { font-size: 10px; margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
  .sig .line { border-top: 1px solid #000; margin-top: 22px; padding-top: 2px;
    font-size: 9px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
  .rodape { font-size: 9px; margin-top: 8px; text-align: center; }
  .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 8px; }
  .toolbar button { background: #1d4ed8; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 6px; cursor: pointer; font-weight: 600; }
  .toolbar button.sec { background: #e2e8f0; color: #0f172a; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    .no-print, .toolbar { display: none !important; visibility: hidden !important; }
    .receipt { width: 72mm; margin: 0; padding: 3mm 3mm 6mm; }
  }
</style></head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Imprimir</button>
    <button class="sec" onclick="window.close()">Fechar</button>
  </div>
  <div class="receipt">
    <div class="center clinica">${esc(input.clinicaNome)}</div>
    <div class="center titulo">${esc(titulo)}</div>
    <div class="sep"></div>
    <div class="valor-destaque">${esc(fmtBRL(input.valor))}</div>
    <div class="sep"></div>
    ${linhas
      .filter(([, v]) => !!(v && String(v).trim()))
      .map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(String(v))}</span></div>`)
      .join("")}
    <div class="sep"></div>
    <div class="desc"><b>Descrição:</b> ${esc(input.descricao)}</div>
    ${input.observacoes && input.observacoes.trim()
      ? `<div class="desc"><b>Observações:</b> ${esc(input.observacoes)}</div>`
      : ""}
    <div class="sep"></div>
    <div class="sig"><div class="line">Assinatura do Atendente</div></div>
    <div class="rodape">Emitido em ${esc(fmtDT(agora))} — ClinicaOS</div>
  </div>
</body></html>`;

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
    const onAfter = () => { cleanup(); win.removeEventListener("afterprint", onAfter); };
    win.addEventListener("afterprint", onAfter);
    setTimeout(cleanup, 60000);
  };

  if (doc.readyState === "complete") {
    setTimeout(triggerPrint, 100);
  } else {
    iframe.addEventListener("load", () => setTimeout(triggerPrint, 100), { once: true });
  }
}
