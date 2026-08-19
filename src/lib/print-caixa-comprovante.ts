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

  const difValor = Number(input.diferenca ?? 0);
  const difConfere = Math.abs(difValor) < 0.005;
  const difRotulo = difConfere
    ? "Diferença (confere)"
    : difValor > 0
      ? "Diferença (SOBRA)"
      : "Diferença (FALTA)";

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
    linhas.push({
      label: difRotulo,
      valor: fmtBRL(difValor),
      destaque: Math.abs(difValor) > 0.009,
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
    /** Linha "rótulo ......... valor", com pontilhado ligando os dois lados. */
    const linha80 = (rotulo: string, valor: string, forte = false) =>
      `<div class="row${forte ? " forte" : ""}">
         <span class="k">${esc(rotulo)}</span>
         <span class="dots"></span>
         <span class="v">${esc(valor)}</span>
       </div>`;

    /**
     * Campo empilhado (rótulo em cima, valor embaixo). Usado para nomes de
     * pessoa: numa bobina de 72mm um nome completo não cabe na mesma linha
     * do rótulo sem espremer as duas metades.
     */
    const campo80 = (rotulo: string, valor: string) =>
      `<div class="campo">
         <div class="campo-rot">${esc(rotulo)}</div>
         <div class="campo-val">${esc(valor)}</div>
       </div>`;

    /** Título de seção: texto pequeno em caixa alta com filete embaixo. */
    const secao80 = (rotulo: string) => `<div class="secao">${esc(rotulo)}</div>`;

    /** Caixa com o número que importa (valor do movimento ou diferença). */
    const destaque80 = (rotulo: string, valor: string, alerta = false) =>
      `<div class="destaque${alerta ? " alerta" : ""}">
         <div class="destaque-rot">${esc(rotulo)}</div>
         <div class="destaque-val">${esc(valor)}</div>
       </div>`;

    const identBlock = `${secao80("Identificação")}
       ${linha80("Data / hora", dtStr)}
       ${campo80("Atendente", input.operadorNome)}
       ${!isFech && input.destinoNome ? campo80(rotuloDestino, input.destinoNome) : ""}`;

    const turnoBlock = isFech
      ? `${secao80("Turno")}
       ${input.aberturaEm ? linha80("Início do turno", fmtDT(new Date(input.aberturaEm))) : ""}
       ${input.fechamentoEm ? linha80("Fim do turno", fmtDT(new Date(input.fechamentoEm))) : ""}
       ${typeof input.saldoInicial === "number" ? linha80("Saldo inicial (troco)", fmtBRL(input.saldoInicial)) : ""}
       ${typeof input.esperadoGaveta === "number" ? linha80("Esperado em espécie", fmtBRL(input.esperadoGaveta)) : ""}`
      : "";

    const conferenciaBlock = isFech
      ? `${secao80("Conferência do caixa")}
       ${linha80("Saldo calculado pelo sistema", fmtBRL(input.saldoCalculado ?? 0))}
       ${linha80("Valor conferido em caixa", fmtBRL(input.valorInformado ?? input.valor), true)}
       ${destaque80(difRotulo, fmtBRL(difValor), !difConfere)}`
      : destaque80("Valor", fmtBRL(input.valor));

    const formasBlock = formasEntries.length
      ? `${secao80("Recebimentos por forma")}
       ${formasEntries.map(([k, v]) => linha80(formaLabel(k), fmtBRL(Number(v)))).join("")}
       ${linha80("Total recebido", fmtBRL(totalFormas), true)}`
      : "";

    const movsBlock = movs.length
      ? `${secao80("Sangrias e suprimentos")}
       ${movs
         .map((m) => {
           const sinal = m.tipo === "sangria" ? "−" : "+";
           // Dia/mês + hora: o ano não cabe na largura da bobina e o turno
           // impresso já diz de que ano o fechamento é.
           const dm = new Date(m.created_at);
           const pad = (n: number) => String(n).padStart(2, "0");
           const quandoMov = `${pad(dm.getDate())}/${pad(dm.getMonth() + 1)} ${pad(dm.getHours())}:${pad(dm.getMinutes())}`;
           return `<div class="item">
              ${linha80(`${m.tipo === "sangria" ? "Sangria" : "Suprimento"} · ${quandoMov}`, `${sinal} ${fmtBRL(Number(m.valor || 0))}`)}
              ${m.descricao ? `<div class="item-desc">${esc(m.descricao)}</div>` : ""}
            </div>`;
         })
         .join("")}
       ${linha80("Total de suprimentos", `+ ${fmtBRL(totalSup)}`, true)}
       ${linha80("Total de sangrias", `− ${fmtBRL(totalSang)}`, true)}`
      : "";

    const descBlock =
      input.descricao && input.descricao.trim()
        ? `${secao80("Observações")}
       <div class="desc">${esc(input.descricao)}</div>`
        : "";

    const assinatura80 = (cargo: string, nome?: string | null) =>
      `<div class="sig">
         <div class="sig-linha"></div>
         <div class="sig-nome">${nome && nome.trim() ? esc(nome) : "&nbsp;"}</div>
         <div class="sig-cargo">${esc(cargo)}</div>
       </div>`;

    const css80 = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f4f4f5; color: #000;
    font-family: "Consolas", "Menlo", "Courier New", ui-monospace, monospace; }
  .receipt { width: 72mm; max-width: 100%; padding: 4mm 3mm 8mm; margin: 0 auto;
    background: #fff; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }

  /* ---- cabeçalho ---- */
  .marca { text-align: center; }
  .marca .clinica { font-size: 14px; font-weight: 800; text-transform: uppercase;
    letter-spacing: .5px; line-height: 1.2; }
  .marca .doc-tipo { margin: 5px 0 3px; padding: 3px 4px; background: #000; color: #fff;
    font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px;
    line-height: 1.3; }
  .marca .doc-sub { font-size: 9.5px; letter-spacing: .3px; }

  /* ---- seções ---- */
  .secao { margin: 9px 0 3px; padding-bottom: 2px; border-bottom: 1px solid #000;
    font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.4px; }

  /* ---- linhas rótulo/valor com guia pontilhada ---- */
  .row { display: flex; align-items: baseline; gap: 3px; margin-top: 2px; }
  .row .k { flex: 0 1 auto; min-width: 0; font-size: 9.5px; overflow-wrap: anywhere; }
  .row .dots { flex: 1 1 6px; min-width: 6px; align-self: stretch;
    border-bottom: 1px dotted #9a9a9a; transform: translateY(-3px); }
  .row .v { flex: none; text-align: right; white-space: nowrap; font-weight: 600;
    font-variant-numeric: tabular-nums; }
  .row.forte .k { font-weight: 700; }
  .row.forte .v { font-weight: 800; }

  /* ---- campo empilhado (nomes longos) ---- */
  .campo { margin-top: 3px; }
  .campo-rot { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
  .campo-val { font-size: 11px; font-weight: 700; line-height: 1.25; }

  /* ---- caixa de destaque (valor / diferença) ---- */
  .destaque { margin: 7px 0 2px; padding: 5px 6px; border: 1.5px solid #000;
    border-radius: 3px; text-align: center; }
  .destaque.alerta { border-width: 3px; }
  .destaque-rot { font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.2px; }
  .destaque-val { font-size: 19px; font-weight: 800; line-height: 1.15; margin-top: 1px;
    font-variant-numeric: tabular-nums; }

  /* ---- itens com descrição (sangrias/suprimentos) ---- */
  .item { margin-top: 3px; }
  .item-desc { font-size: 9px; padding-left: 6px; word-break: break-word; }

  .desc { font-size: 9.5px; line-height: 1.45; margin-top: 3px;
    white-space: pre-wrap; word-break: break-word; }

  /* ---- assinaturas ---- */
  .assinaturas { margin-top: 12px; }
  .sig { margin-top: 24px; }
  .sig .sig-linha { border-top: 1px solid #000; }
  .sig .sig-nome { font-size: 10px; font-weight: 700; text-align: center;
    min-height: 13px; margin-top: 2px; }
  .sig .sig-cargo { font-size: 8.5px; text-align: center; text-transform: uppercase;
    letter-spacing: 1px; }

  .rodape { margin-top: 12px; padding-top: 5px; border-top: 1px dashed #000;
    font-size: 8.5px; text-align: center; letter-spacing: .3px; }

  @media print {
    @page { size: 80mm auto; margin: 0; }
    html, body { background: #fff; }
    .receipt { width: 72mm; margin: 0; padding: 3mm 3mm 8mm; }
    .secao, .destaque, .sig, .item { break-inside: avoid; page-break-inside: avoid; }
  }
${CSS_TOOLBAR_80MM}`;

    const corpo80 = `
  <div class="receipt">
    <div class="marca">
      <div class="clinica">${esc(input.clinicaNome)}</div>
      <div class="doc-tipo">${esc(titulo.replace(/^COMPROVANTE DE /, ""))}</div>
      <div class="doc-sub">${esc(SUBTITULOS[input.tipo])}</div>
    </div>

    ${identBlock}
    ${turnoBlock}
    ${conferenciaBlock}
    ${formasBlock}
    ${movsBlock}
    ${descBlock}

    <div class="assinaturas">
      ${assinatura80("Assinatura do atendente", input.operadorNome)}
      ${
        !isFech && input.destinoNome
          ? assinatura80(cargoDestino, input.destinoNome)
          : assinatura80("Assinatura da tesouraria")
      }
    </div>

    <div class="rodape">Emitido em ${esc(dtStr)} · ClinicaOS</div>
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
