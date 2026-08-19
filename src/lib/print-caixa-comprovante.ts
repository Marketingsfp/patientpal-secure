/**
 * Comprovante impresso de movimentação de caixa (Sangria, Suprimento,
 * Estorno, Fechamento). Contém data/hora, valores e duas linhas de
 * assinatura: Atendente e Tesouraria (ou quem recebeu/entregou o dinheiro).
 *
 * O papel padrão é A4, com o mesmo desenho do recibo de lançamento — antes
 * todos esses comprovantes saíam no formato de bobina térmica de 72mm, o que
 * numa impressora de folha virava um cupom minúsculo e ilegível no canto da
 * página. Quem imprime em bobina passa `formato: "80mm"`.
 */

import {
  assinaturaA4,
  campoA4,
  CSS_TOOLBAR_80MM,
  documentoA4,
  esc,
  headerA4,
  linhaValorA4,
} from "./print-doc-a4";
import { printHtmlViaIframe } from "./print-html";

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDT = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export type ComprovanteCaixaTipo = "sangria" | "suprimento" | "fechamento" | "estorno";

export interface ComprovanteCaixaInput {
  tipo: ComprovanteCaixaTipo;
  clinicaNome: string;
  operadorNome: string;
  valor: number;
  descricao?: string | null;
  /** Nome do usuário destinatário (sangria: entregue a; suprimento: recebido de) */
  destinoNome?: string | null;
  /** Preenchidos somente no fechamento. */
  saldoCalculado?: number;
  valorInformado?: number;
  diferenca?: number;
  /** Totais por forma de pagamento (somente fechamento). Chave = forma, valor = R$. */
  porForma?: Record<string, number>;
  /** Data/hora do movimento (default: agora). */
  quando?: Date;
  /** Formato do papel. `a4` (padrão) ou `80mm` (bobina térmica). */
  formato?: "80mm" | "a4";
  /** Abertura do turno (ISO) — impresso no fechamento. */
  aberturaEm?: string | null;
  /** Encerramento do turno (ISO) — impresso no fechamento. */
  fechamentoEm?: string | null;
  /** Troco/fundo de abertura (fechamento). */
  saldoInicial?: number;
  /** Esperado em espécie na gaveta (fechamento). */
  esperadoGaveta?: number;
  /** Sangrias e suprimentos do turno (fechamento). */
  movimentos?: Array<{
    tipo: "sangria" | "suprimento";
    valor: number;
    descricao?: string | null;
    created_at: string;
  }>;
}

const TITULOS: Record<ComprovanteCaixaTipo, string> = {
  sangria: "COMPROVANTE DE SANGRIA",
  suprimento: "COMPROVANTE DE SUPRIMENTO",
  fechamento: "COMPROVANTE DE FECHAMENTO DE CAIXA",
  estorno: "COMPROVANTE DE ESTORNO",
};

const SUBTITULOS: Record<ComprovanteCaixaTipo, string> = {
  sangria: "Retirada de dinheiro do caixa",
  suprimento: "Adição de dinheiro ao caixa",
  fechamento: "Conferência e encerramento do caixa",
  estorno: "Devolução de valor ao paciente",
};

const SELOS: Record<
  ComprovanteCaixaTipo,
  { texto: string; cor: "receita" | "despesa" | "neutro" }
> = {
  sangria: { texto: "Saída", cor: "despesa" },
  suprimento: { texto: "Entrada", cor: "receita" },
  fechamento: { texto: "Fechamento", cor: "neutro" },
  estorno: { texto: "Estorno", cor: "despesa" },
};

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de Débito",
  credito: "Cartão de Crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  cheque: "Cheque",
  convenio: "Convênio",
  associado: "Associado",
  outros: "Outros",
};
const formaLabel = (k: string) =>
  FORMA_LABEL[k?.toLowerCase?.()] ?? (k ? k.charAt(0).toUpperCase() + k.slice(1) : "Outros");

/** Monta o HTML do comprovante — exportado para permitir pré-visualização. */
export function buildComprovanteCaixaHtml(input: ComprovanteCaixaInput): string {
  const quando = input.quando ?? new Date();
  const dtStr = fmtDT(quando);
  const isFech = input.tipo === "fechamento";
  const is80 = input.formato === "80mm";
  const titulo = TITULOS[input.tipo];

  const linhas: Array<{ label: string; valor: string; destaque?: boolean }> = [];
  if (isFech) {
    linhas.push({
      label: "Saldo calculado pelo sistema",
      valor: fmtBRL(input.saldoCalculado ?? 0),
    });
    linhas.push({
      label: "Valor conferido em caixa",
      valor: fmtBRL(input.valorInformado ?? input.valor),
    });
    const dif = Number(input.diferenca ?? 0);
    linhas.push({
      label:
        Math.abs(dif) < 0.005
          ? "Diferença (confere)"
          : dif > 0
            ? "Diferença (SOBRA)"
            : "Diferença (FALTA)",
      valor: fmtBRL(dif),
      destaque: Math.abs(dif) > 0.009,
    });
  } else {
    linhas.push({ label: "Valor", valor: fmtBRL(input.valor), destaque: true });
  }

  const formasEntries =
    isFech && input.porForma
      ? Object.entries(input.porForma).filter(([, v]) => Number(v) > 0.0009)
      : [];
  const totalFormas = formasEntries.reduce((s, [, v]) => s + Number(v || 0), 0);

  const movs = isFech ? (input.movimentos ?? []) : [];
  const totalSup = movs
    .filter((m) => m.tipo === "suprimento")
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const totalSang = movs
    .filter((m) => m.tipo === "sangria")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const rotuloDestino = input.tipo === "sangria" ? "Entregue a" : "Recebido de";
  const cargoDestino =
    input.tipo === "sangria" ? "Assinatura de quem recebeu" : "Assinatura de quem entregou";

  /* ---------------- versão bobina 80mm (compacta) ---------------- */
  if (is80) {
    const formasBlock = formasEntries.length
      ? `<div class="sep"></div>
       <div class="center" style="font-size:10px;font-weight:800;text-transform:uppercase;">Recebimentos por forma</div>
       ${formasEntries
         .map(
           ([k, v]) =>
             `<div class="row"><span class="k">${esc(formaLabel(k))}</span><span class="v">${esc(fmtBRL(Number(v)))}</span></div>`,
         )
         .join("")}
       <div class="row" style="margin-top:2px;"><span class="k bold">Total recebido</span><span class="v bold">${esc(fmtBRL(totalFormas))}</span></div>`
      : "";
    const movsBlock = movs.length
      ? `<div class="sep"></div>
       <div class="center" style="font-size:10px;font-weight:800;text-transform:uppercase;">Sangrias e suprimentos</div>
       ${movs
         .map(
           (m) =>
             `<div class="row"><span class="k">${esc(new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))} ${m.tipo === "sangria" ? "SANGRIA" : "SUPRIMENTO"}${m.descricao ? " — " + esc(m.descricao) : ""}</span><span class="v">${m.tipo === "sangria" ? "-" : "+"} ${esc(fmtBRL(Number(m.valor || 0)))}</span></div>`,
         )
         .join("")}
       <div class="row" style="margin-top:2px;"><span class="k bold">Total suprimentos</span><span class="v bold">${esc(fmtBRL(totalSup))}</span></div>
       <div class="row"><span class="k bold">Total sangrias</span><span class="v bold">${esc(fmtBRL(totalSang))}</span></div>`
      : "";
    const turnoBlock = isFech
      ? `${input.aberturaEm ? `<div class="row"><span class="k">Início do turno</span><span class="v">${esc(fmtDT(new Date(input.aberturaEm)))}</span></div>` : ""}
       ${input.fechamentoEm ? `<div class="row"><span class="k">Fim do turno</span><span class="v">${esc(fmtDT(new Date(input.fechamentoEm)))}</span></div>` : ""}
       ${typeof input.saldoInicial === "number" ? `<div class="row"><span class="k">Saldo inicial (troco)</span><span class="v">${esc(fmtBRL(input.saldoInicial))}</span></div>` : ""}
       ${typeof input.esperadoGaveta === "number" ? `<div class="row"><span class="k">Esperado em espécie</span><span class="v">${esc(fmtBRL(input.esperadoGaveta))}</span></div>` : ""}`
      : "";

    const css80 = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000;
    font-family: "Consolas", "Menlo", "Courier New", ui-monospace, monospace; }
  .receipt { width: 72mm; padding: 3mm 3mm 6mm; margin: 0 auto; font-size: 11px; line-height: 1.35; }
  .center { text-align: center; }
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
    .receipt { width: 72mm; margin: 0; padding: 3mm 3mm 6mm; }
  }
${CSS_TOOLBAR_80MM}`;

    const corpo80 = `
  <div class="receipt">
    <div class="center clinica">${esc(input.clinicaNome)}</div>
    <div class="center titulo">${esc(titulo)}</div>
    <div class="center subtitulo">${esc(SUBTITULOS[input.tipo])}</div>
    <div class="sep"></div>
    <div class="row"><span class="k">Data/Hora</span><span class="v">${esc(dtStr)}</span></div>
    <div class="row"><span class="k">Atendente</span><span class="v">${esc(input.operadorNome)}</span></div>
    ${turnoBlock}
    ${
      !isFech && input.destinoNome
        ? `<div class="row"><span class="k">${esc(rotuloDestino)}</span><span class="v bold">${esc(input.destinoNome)}</span></div>`
        : ""
    }
    <div class="sep"></div>
    ${
      isFech
        ? linhas
            .map(
              (l) =>
                `<div class="row"><span class="k">${esc(l.label)}</span><span class="v ${l.destaque ? "bold" : ""}">${esc(l.valor)}</span></div>`,
            )
            .join("")
        : `<div class="valor-destaque">${esc(fmtBRL(input.valor))}</div>`
    }
    ${formasBlock}
    ${movsBlock}
    ${input.descricao ? `<div class="sep"></div><div class="desc"><b>Descrição:</b> ${esc(input.descricao)}</div>` : ""}
    <div class="sep"></div>
    <div class="sig">
      <div class="nome">${esc(input.operadorNome)}</div>
      <div class="line">Assinatura do Atendente</div>
    </div>
    <div class="sig">
      <div class="nome">${!isFech && input.destinoNome ? esc(input.destinoNome) : "&nbsp;"}</div>
      <div class="line">${!isFech && input.destinoNome ? esc(cargoDestino) : "Assinatura da Tesouraria"}</div>
    </div>
    <div class="rodape">${esc(dtStr)} — ClinicaOS</div>
  </div>`;

    return documentoA4(titulo, corpo80, css80);
  }

  /* ------------------- versão A4 (padrão, grande) ------------------- */
  const campos: string[] = [
    campoA4("Data e hora", dtStr),
    campoA4("Atendente", input.operadorNome),
  ];
  if (isFech) {
    if (input.aberturaEm)
      campos.push(campoA4("Início do turno", fmtDT(new Date(input.aberturaEm))));
    if (input.fechamentoEm)
      campos.push(campoA4("Fim do turno", fmtDT(new Date(input.fechamentoEm))));
    if (typeof input.saldoInicial === "number")
      campos.push(campoA4("Saldo inicial (troco)", fmtBRL(input.saldoInicial)));
    if (typeof input.esperadoGaveta === "number")
      campos.push(campoA4("Esperado em espécie", fmtBRL(input.esperadoGaveta)));
  } else if (input.destinoNome) {
    campos.push(campoA4(rotuloDestino, input.destinoNome));
  }

  const valorBox = isFech
    ? `<div class="secao">
        <div class="rot">Conferência do caixa</div>
        ${linhas.map((l) => linhaValorA4(l.label, l.valor, { destaque: l.destaque })).join("")}
      </div>`
    : `<div class="valor-box">
        <div class="rot">Valor</div>
        <div class="valor">${esc(fmtBRL(input.valor))}</div>
      </div>`;

  const formasSecao = formasEntries.length
    ? `<div class="secao">
        <div class="rot">Recebimentos por forma de pagamento</div>
        ${formasEntries.map(([k, v]) => linhaValorA4(formaLabel(k), fmtBRL(Number(v)))).join("")}
        ${linhaValorA4("Total recebido", fmtBRL(totalFormas), { total: true })}
      </div>`
    : "";

  const movsSecao = movs.length
    ? `<div class="secao">
        <div class="rot">Sangrias e suprimentos do turno</div>
        ${movs
          .map((m) =>
            linhaValorA4(
              `${new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${m.tipo === "sangria" ? "Sangria" : "Suprimento"}`,
              `${m.tipo === "sangria" ? "−" : "+"} ${fmtBRL(Number(m.valor || 0))}`,
              { descricao: m.descricao },
            ),
          )
          .join("")}
        ${linhaValorA4("Total de suprimentos", fmtBRL(totalSup), { total: true })}
        ${linhaValorA4("Total de sangrias", fmtBRL(totalSang))}
      </div>`
    : "";

  const corpoA4 = `
  <div class="folha">
    <div class="doc">
      ${headerA4(input.clinicaNome, SUBTITULOS[input.tipo], SELOS[input.tipo])}

      <div class="titulo">${esc(titulo)}</div>

      ${valorBox}

      <div class="grade">
        ${campos.join("")}
      </div>

      ${formasSecao}
      ${movsSecao}

      ${
        input.descricao && input.descricao.trim()
          ? `<div class="bloco">
        <div class="rot">Descrição</div>
        <div class="texto">${esc(input.descricao)}</div>
      </div>`
          : ""
      }

      <div class="assinaturas">
        ${assinaturaA4("Assinatura do Atendente", input.operadorNome)}
        ${
          !isFech && input.destinoNome
            ? assinaturaA4(cargoDestino, input.destinoNome)
            : assinaturaA4("Assinatura da Tesouraria")
        }
      </div>

      <div class="rodape">Emitido em ${esc(dtStr)} — ClinicaOS</div>
    </div>
  </div>`;

  return documentoA4(titulo, corpoA4);
}

export function printComprovanteCaixa(input: ComprovanteCaixaInput) {
  printHtmlViaIframe(buildComprovanteCaixaHtml(input));
}
