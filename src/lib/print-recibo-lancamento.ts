/**
 * Recibo impresso de um lançamento financeiro (Nova Receita / Nova Despesa),
 * incluindo as despesas de repasse médico geradas pelo caixa.
 * Usado pelo botão "Salvar e imprimir" e pelo "Reimprimir recibo" da lista do
 * Movimento de Caixa, quando a tela chamadora não possui um fluxo de impressão
 * próprio (guia de atendimento, carnê, etc.).
 *
 * O papel padrão é A4: o recibo sai como documento grande e legível, ocupando
 * a largura útil da folha — antes ele era desenhado para bobina de 72mm e, ao
 * cair numa impressora A4, saía minúsculo no canto da página. Quem imprime em
 * bobina térmica passa `formato: "80mm"` e recebe a versão compacta.
 */

import {
  assinaturaA4,
  campoA4,
  CSS_TOOLBAR_80MM,
  documentoA4,
  esc,
  headerA4,
} from "./print-doc-a4";
import { printHtmlViaIframe } from "./print-html";

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
  /** Marca o papel como segunda via (reimpressão de um lançamento antigo). */
  segundaVia?: boolean;
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
  const rodape = `Emitido em ${fmtDT(agora)} — ClinicaOS${input.segundaVia ? " · SEGUNDA VIA" : ""}`;

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
  if (is80) {
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
  }
${CSS_TOOLBAR_80MM}`;

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
    <div class="rodape">${esc(rodape)}</div>
  </div>`;

    return documentoA4(titulo, corpo80, css80);
  }

  /* ------------------- versão A4 (padrão, grande) ------------------- */
  const corpoA4 = `
  <div class="folha">
    <div class="doc">
      ${headerA4(input.clinicaNome, subtitulo, {
        texto: isReceita ? "Receita" : "Despesa",
        cor: isReceita ? "receita" : "despesa",
      })}

      <div class="titulo">${esc(titulo)}${input.segundaVia ? " — 2ª via" : ""}</div>

      <div class="valor-box">
        <div class="rot">Valor</div>
        <div class="valor">${esc(fmtBRL(input.valor))}</div>
        <div class="extenso">(${esc(valorPorExtenso(input.valor))})</div>
      </div>

      <div class="grade">
        ${campos.map(([k, v]) => campoA4(k, String(v))).join("")}
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
        ${assinaturaA4("Assinatura do Atendente", input.operadorNome)}
        ${assinaturaA4(isReceita ? "Assinatura do Pagador" : "Assinatura de quem recebeu")}
      </div>

      <div class="rodape">${esc(rodape)}</div>
    </div>
  </div>`;

  return documentoA4(titulo, corpoA4);
}

export function printReciboLancamento(input: ReciboLancamentoInput) {
  printHtmlViaIframe(buildReciboLancamentoHtml(input));
}
