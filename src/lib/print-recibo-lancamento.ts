/**
 * Recibo impresso de um lançamento financeiro (Nova Receita / Nova Despesa).
 * Usado pelo botão "Salvar e imprimir" quando a tela chamadora não possui
 * um fluxo de impressão próprio (guia de atendimento, carnê, etc.).
 * Abre a impressão via iframe oculto para não sofrer bloqueio de pop-up.
 *
 * O papel padrão é A4: o recibo sai como documento grande e legível, ocupando
 * a largura útil da folha — antes ele era desenhado para bobina de 72mm e, ao
 * cair numa impressora A4, saía minúsculo no canto da página. Quem imprime em
 * bobina térmica passa `formato: "80mm"` e recebe a versão compacta.
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

/* ------------------------------------------------------------------ */
/* Valor por extenso — praxe em recibo de despesa que vai ser assinado. */
/* ------------------------------------------------------------------ */

const UNIDADES = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

/** Escreve um número de 1 a 999 por extenso. */
const trioExtenso = (n: number): string => {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
  }
  return partes.join(" e ");
};

/** 1234.5 -> "mil, duzentos e trinta e quatro reais e cinquenta centavos". */
export const valorPorExtenso = (valor: number): string => {
  const total = Math.round(Math.abs(Number(valor) || 0) * 100);
  const reais = Math.floor(total / 100);
  const centavos = total % 100;

  const grupos: string[] = [];
  const milhoes = Math.floor(reais / 1_000_000);
  const milhares = Math.floor((reais % 1_000_000) / 1000);
  const unidades = reais % 1000;

  if (milhoes) grupos.push(`${trioExtenso(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  if (milhares) grupos.push(milhares === 1 ? "mil" : `${trioExtenso(milhares)} mil`);
  if (unidades) grupos.push(trioExtenso(unidades));

  const parteReais = grupos.length ? `${grupos.join(", ")} ${reais === 1 ? "real" : "reais"}` : "";
  const parteCent = centavos
    ? `${trioExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`
    : "";

  if (!parteReais && !parteCent) return "zero real";
  if (!parteCent) return parteReais;
  if (!parteReais) return parteCent;
  return `${parteReais} e ${parteCent}`;
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
  /** Papel: `a4` (padrão, documento grande) ou `80mm` (bobina térmica). */
  formato?: "a4" | "80mm";
}

/**
 * Monta o HTML do recibo. Exportado à parte da impressão para permitir
 * pré-visualizar/testar o papel sem depender do `window.print()`.
 */
export function buildReciboLancamentoHtml(input: ReciboLancamentoInput): string {
  const agora = new Date();
  const isReceita = input.tipo === "receita";
  const titulo = isReceita ? "RECIBO DE PAGAMENTO" : "COMPROVANTE DE DESPESA";
  const subtitulo = isReceita
    ? "Confirmação de valor recebido"
    : "Confirmação de valor pago pela clínica";
  const is80 = input.formato === "80mm";

  const linhas: Array<[string, string | null | undefined]> = [
    ["Data", fmtDataISO(input.data)],
    ["Paciente", input.pacienteNome],
    ["Categoria", input.categoriaNome],
    ["Forma de pagamento", input.formaPagamentoLabel],
    ["Conta", input.contaNome],
    ["Atendente", input.operadorNome],
  ];
  const campos = linhas.filter(([, v]) => !!(v && String(v).trim()));

  /* ---------------- versão bobina 80mm (compacta) ---------------- */
  const corpo80 = `
  <div class="receipt">
    <div class="center clinica">${esc(input.clinicaNome)}</div>
    <div class="center titulo">${esc(titulo)}</div>
    <div class="sep"></div>
    <div class="valor-destaque">${esc(fmtBRL(input.valor))}</div>
    <div class="sep"></div>
    ${campos
      .map(
        ([k, v]) =>
          `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(String(v))}</span></div>`,
      )
      .join("")}
    <div class="sep"></div>
    <div class="desc"><b>Descrição:</b> ${esc(input.descricao)}</div>
    ${
      input.observacoes && input.observacoes.trim()
        ? `<div class="desc"><b>Observações:</b> ${esc(input.observacoes)}</div>`
        : ""
    }
    <div class="sep"></div>
    <div class="sig"><div class="line">Assinatura do Atendente</div></div>
    <div class="rodape">Emitido em ${esc(fmtDT(agora))} — ClinicaOS</div>
  </div>`;

  const css80 = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    font-family: "Consolas", "Menlo", "Courier New", ui-monospace, monospace; }
  .receipt { width: 72mm; padding: 3mm 3mm 6mm; margin: 0 auto; font-size: 11px; line-height: 1.35; }
  .center { text-align: center; }
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
  @media print {
    @page { size: 80mm auto; margin: 0; }
    .receipt { width: 72mm; margin: 0; padding: 3mm 3mm 6mm; }
  }`;

  /* ------------------- versão A4 (padrão, grande) ------------------- */
  const corpoA4 = `
  <div class="folha">
    <div class="doc">
      <header>
        <div class="marca">
          <div class="clinica">${esc(input.clinicaNome)}</div>
          <div class="sub">${esc(subtitulo)}</div>
        </div>
        <div class="selo ${isReceita ? "receita" : "despesa"}">${isReceita ? "Receita" : "Despesa"}</div>
      </header>

      <div class="titulo">${esc(titulo)}</div>

      <div class="valor-box">
        <div class="rot">Valor</div>
        <div class="valor">${esc(fmtBRL(input.valor))}</div>
        <div class="extenso">(${esc(valorPorExtenso(input.valor))})</div>
      </div>

      <div class="grade">
        ${campos
          .map(
            ([k, v]) => `<div class="campo">
          <div class="rot">${esc(k)}</div>
          <div class="val">${esc(String(v))}</div>
        </div>`,
          )
          .join("")}
      </div>

      <div class="bloco">
        <div class="rot">Descrição</div>
        <div class="texto">${esc(input.descricao)}</div>
      </div>
      ${
        input.observacoes && input.observacoes.trim()
          ? `<div class="bloco">
        <div class="rot">Observações</div>
        <div class="texto">${esc(input.observacoes)}</div>
      </div>`
          : ""
      }

      <div class="assinaturas">
        <div class="assinatura">
          <div class="nome">${esc(input.operadorNome ?? "")}</div>
          <div class="linha"></div>
          <div class="cargo">Assinatura do Atendente</div>
        </div>
        <div class="assinatura">
          <div class="nome">&nbsp;</div>
          <div class="linha"></div>
          <div class="cargo">${isReceita ? "Assinatura do Pagador" : "Assinatura de quem recebeu"}</div>
        </div>
      </div>

      <div class="rodape">Emitido em ${esc(fmtDT(agora))} — ClinicaOS</div>
    </div>
  </div>`;

  const cssA4 = `
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

  .titulo { text-align: center; font-size: 16pt; font-weight: 800; letter-spacing: 2px;
    text-transform: uppercase; margin: 16px 0 12px; }

  .valor-box { border: 1.5px solid #18181b; border-radius: 8px; background: #fafafa;
    text-align: center; padding: 12px 14px; margin-bottom: 16px; }
  .valor-box .rot { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #52525b; }
  .valor-box .valor { font-size: 34pt; font-weight: 800; line-height: 1.1; margin-top: 2px; }
  .valor-box .extenso { font-size: 11pt; color: #3f3f46; margin-top: 4px; font-style: italic; }

  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin-bottom: 4px; }
  .campo { border-bottom: 1px dotted #a1a1aa; padding-bottom: 5px; }
  .campo .rot { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: #52525b; }
  .campo .val { font-size: 13pt; font-weight: 600; line-height: 1.3; word-break: break-word; }

  .bloco { margin-top: 12px; border: 1px solid #e4e4e7; border-radius: 8px; padding: 10px 12px; }
  .bloco .rot { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: #52525b; }
  .bloco .texto { font-size: 12.5pt; line-height: 1.5; margin-top: 3px;
    white-space: pre-wrap; word-break: break-word; }

  .assinaturas { display: flex; gap: 26px; margin-top: 30px; }
  .assinatura { flex: 1; text-align: center; }
  .assinatura .nome { font-size: 11.5pt; font-weight: 700; min-height: 16pt; }
  .assinatura .linha { border-top: 1.5px solid #18181b; margin-top: 26px; }
  .assinatura .cargo { font-size: 9pt; text-transform: uppercase; letter-spacing: 1px;
    color: #3f3f46; margin-top: 5px; }

  .rodape { text-align: center; font-size: 8.5pt; color: #71717a; margin-top: 18px;
    border-top: 1px solid #e4e4e7; padding-top: 8px; }

  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    html, body { background: #fff; }
    .folha { max-width: none; margin: 0; padding: 0; }
    .doc { border: none; border-radius: 0; padding: 0; }
    .doc, .assinaturas, .bloco { break-inside: avoid; page-break-inside: avoid; }
  }`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
${is80 ? css80 : cssA4}
  .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 8px; }
  .toolbar button { background: #1d4ed8; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 6px; cursor: pointer; font-weight: 600; font-family: inherit; }
  .toolbar button.sec { background: #e2e8f0; color: #0f172a; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print, .toolbar { display: none !important; visibility: hidden !important; }
  }
</style></head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Imprimir</button>
    <button class="sec" onclick="window.close()">Fechar</button>
  </div>
${is80 ? corpo80 : corpoA4}
</body></html>`;

  return html;
}

export function printReciboLancamento(input: ReciboLancamentoInput) {
  const html = buildReciboLancamentoHtml(input);

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
      try {
        document.body.removeChild(iframe);
      } catch {
        /* noop */
      }
    }, 1000);
  };

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* noop */
    }
    const onAfter = () => {
      cleanup();
      win.removeEventListener("afterprint", onAfter);
    };
    win.addEventListener("afterprint", onAfter);
    setTimeout(cleanup, 60000);
  };

  if (doc.readyState === "complete") {
    setTimeout(triggerPrint, 100);
  } else {
    iframe.addEventListener("load", () => setTimeout(triggerPrint, 100), { once: true });
  }
}
