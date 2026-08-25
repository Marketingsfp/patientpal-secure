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
  CSS_DOC_A4,
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
  /** Totais por forma de pagamento (somente fechamento). Chave = forma, valor
   *  = saldo LÍQUIDO da forma (entradas − saídas). Mantido por compatibilidade:
   *  quando `porFormaDetalhe` vem preenchido, é ele que manda. */
  porForma?: Record<string, number>;
  /**
   * Entradas e saídas de cada forma de pagamento no fechamento.
   *
   * Substitui o antigo bloco "Recebimentos por forma", que na verdade imprimia
   * o saldo LÍQUIDO — com sangrias, despesas e estornos já descontados — sob um
   * rótulo de recebimento. Como toda sangria sai em espécie, num dia em que a
   * operadora sangra tudo o Dinheiro fecha em R$ 0,00 e a linha simplesmente
   * desaparecia do papel: o comprovante de 20/08/2026 afirmava R$ 0,00 recebidos
   * em espécie depois de terem passado R$ 9.550,55 pela gaveta. Separando
   * entradas de saídas, o cupom volta a provar quanto entrou, quanto saiu e o
   * que sobrou em cada forma — o mesmo desenho do comprovante do sistema antigo,
   * que é o papel com o qual a tesouraria confere.
   */
  porFormaDetalhe?: Record<string, { entradas: number; saidas: number }>;
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
  /**
   * Composição do dinheiro físico do turno, para o bloco "Dinheiro na gaveta".
   *
   * Antes o cupom trazia só o resultado (`esperadoGaveta`) numa linha discreta
   * do bloco "Turno", enquanto o número grande do papel era o total do dia —
   * que soma cartão e PIX e não tem relação com o que está na gaveta. Numa
   * conferência de 22/08/2026 o total impresso foi R$ 6.526,89 e o dinheiro
   * esperado em espécie era R$ 391,90 (2.841,90 recebidos menos 2.450,00 de
   * sangria): quem contou a gaveta contra o número em destaque concluiu que o
   * caixa não batia, quando ele batia com diferença zero.
   *
   * Com a conta aberta no papel — troco, entradas em espécie, suprimentos,
   * sangrias e despesas — o valor a conferir na gaveta deixa de depender de
   * quem lembra que cartão e PIX não passam por ela.
   */
  composicaoGaveta?: {
    saldoInicial: number;
    recebimentosDinheiro: number;
    suprimentos: number;
    sangrias: number;
    despesas: number;
  };
  /**
   * Quanto do total deste caixa veio de atendimento de DIA ANTERIOR
   * (fechamento). Só aparece no cupom quando há pelo menos um.
   *
   * Uma guia de dias atrás faturada hoje entra no caixa de hoje sempre que o
   * caixa do dia original já estiver fechado — um fechamento já impresso nunca
   * é reescrito. O dinheiro está mesmo na gaveta de hoje, então este valor
   * JÁ ESTÁ SOMADO no total acima e não deve ser descontado de nada. A linha
   * existe para a atendente saber, na hora de conferir, que parte do caixa de
   * hoje corresponde a atendimento de outro dia.
   */
  retroativos?: { total: number; quantidade: number; dias?: string[] };
  /**
   * Guias de atendimentos anteriores, JA QUITADAS em outro dia, emitidas hoje
   * (movimentos de tipo `registro`).
   *
   * Ao contrário de `retroativos`, este valor NÃO está somado no total: ele
   * aparece no extrato do dia da digitação apenas como histórico, e vale
   * R$ 0,00 no dinheiro esperado da gaveta. É o comportamento que o sistema
   * antigo tinha e que a recepção conhece.
   */
  registros?: { total: number; quantidade: number };
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

/** Rótulos curtos: na bobina de 72mm "Cartão de Débito" não cabe na coluna. */
const FORMA_LABEL_CURTO: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
  boleto: "Boleto",
  transferencia: "Transfer.",
  convenio: "Convênio",
  outros: "Outros",
  indeterminado: "Indeterm.",
};
const formaLabelCurto = (k: string) => FORMA_LABEL_CURTO[k?.toLowerCase?.()] ?? formaLabel(k);

/**
 * Formas que aparecem SEMPRE no fechamento, mesmo zeradas. Dinheiro está aqui
 * porque é o único valor físico: se a linha some do papel quando fecha em zero,
 * some junto a prova de quanto passou pela gaveta.
 */
const FORMAS_FIXAS = ["dinheiro", "pix", "debito", "credito"];

/** Ordem fixa das linhas por forma no comprovante de fechamento. */
const ORDEM_FORMAS_COMPROVANTE = [
  ...FORMAS_FIXAS,
  "boleto",
  "transferencia",
  "convenio",
  "outros",
  "indeterminado",
];

/**
 * Número sem "R$": o cabeçalho da tabela já diz que os valores são em reais.
 *
 * O arredondamento para centavo antes de formatar não é cosmético: quando a
 * operadora sangra exatamente tudo o que recebeu, o saldo em dinheiro dá algo
 * como −0,0000000018 em ponto flutuante e o papel saía com "−0,00", que numa
 * conferência parece falta.
 */
const fmtNum = (v: number) => {
  const centavos = Math.round((Number(v) || 0) * 100);
  return (centavos === 0 ? 0 : centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface LinhaForma {
  chave: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

/**
 * Linhas da tabela por forma: as quatro fixas sempre, mais qualquer outra que
 * tenha tido movimento no período. Aceita tanto o formato novo
 * (`porFormaDetalhe`) quanto o antigo (`porForma`, só o líquido).
 */
function linhasPorForma(input: ComprovanteCaixaInput): LinhaForma[] {
  const detalhe: Record<string, { entradas: number; saidas: number }> =
    input.porFormaDetalhe ??
    Object.fromEntries(
      Object.entries(input.porForma ?? {}).map(([k, v]) => [
        k,
        { entradas: Number(v) > 0 ? Number(v) : 0, saidas: Number(v) < 0 ? -Number(v) : 0 },
      ]),
    );
  const extras = Object.keys(detalhe)
    .filter((k) => !ORDEM_FORMAS_COMPROVANTE.includes(k))
    .sort();
  const out: LinhaForma[] = [];
  for (const chave of [...ORDEM_FORMAS_COMPROVANTE, ...extras]) {
    const entradas = Number(detalhe[chave]?.entradas ?? 0);
    const saidas = Number(detalhe[chave]?.saidas ?? 0);
    if (!FORMAS_FIXAS.includes(chave) && Math.abs(entradas) < 0.005 && Math.abs(saidas) < 0.005) {
      continue;
    }
    out.push({ chave, entradas, saidas, saldo: entradas - saidas });
  }
  return out;
}

interface LinhaGaveta {
  label: string;
  /** Valor com sinal: positivo entra na gaveta, negativo sai dela. */
  valor: number;
}

/**
 * Linhas da conta do dinheiro em espécie. Sangria aparece mesmo zerada: é a
 * subtração que explica por que a gaveta tem menos do que o total do dia, e
 * some justamente do papel de quem nunca sangrou e por isso estranha a conta.
 * As demais parcelas só entram quando existem, para o bloco não virar uma
 * lista de zeros na bobina.
 */
function linhasGaveta(input: ComprovanteCaixaInput): LinhaGaveta[] {
  const c = input.composicaoGaveta;
  if (!c) return [];
  const relevante = (v: number) => Math.abs(Number(v) || 0) > 0.005;
  const out: LinhaGaveta[] = [];
  if (relevante(c.saldoInicial)) out.push({ label: "Troco de abertura", valor: c.saldoInicial });
  out.push({ label: "Recebido em dinheiro", valor: Number(c.recebimentosDinheiro) || 0 });
  if (relevante(c.suprimentos)) out.push({ label: "Suprimentos", valor: c.suprimentos });
  out.push({ label: "Sangrias (retiradas)", valor: -(Number(c.sangrias) || 0) });
  if (relevante(c.despesas)) out.push({ label: "Despesas em espécie", valor: -c.despesas });
  return out;
}

/** Esperado em espécie: o número informado manda; sem ele, soma a composição. */
function esperadoEmEspecie(input: ComprovanteCaixaInput): number | undefined {
  if (typeof input.esperadoGaveta === "number") return input.esperadoGaveta;
  const c = input.composicaoGaveta;
  if (!c) return undefined;
  return (
    (Number(c.saldoInicial) || 0) +
    (Number(c.recebimentosDinheiro) || 0) +
    (Number(c.suprimentos) || 0) -
    (Number(c.sangrias) || 0) -
    (Number(c.despesas) || 0)
  );
}

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

  // Parcela do caixa que veio de atendimento de outro dia. Já está somada no
  // total — a linha é informativa, para a conferência não estranhar.
  const retro = input.retroativos;
  const temRetro = !!retro && retro.quantidade > 0;
  const retroRotulo = temRetro
    ? `— dos quais de atendimento de outro dia (${retro!.quantidade} ${
        retro!.quantidade === 1 ? "guia" : "guias"
      })`
    : "";
  const retroNota =
    temRetro && retro!.dias?.length
      ? `Já incluído no total acima. Dias de origem: ${retro!.dias.join(", ")}.`
      : "Já incluído no total acima.";

  // Guias antigas ja pagas, emitidas hoje. NAO estao somadas no total — estao
  // no extrato so como historico do dia da digitacao.
  const regs = input.registros;
  const temRegs = !!regs && regs.quantidade > 0;
  const regsRotulo = temRegs
    ? `Guias de dias anteriores já pagas (${regs!.quantidade} ${
        regs!.quantidade === 1 ? "guia" : "guias"
      })`
    : "";
  const regsNota =
    "NÃO somado no total acima e NÃO entra na contagem da gaveta — recebido em outro dia.";

  const linhas: Array<{ label: string; valor: string; destaque?: boolean; descricao?: string }> =
    [];
  if (isFech) {
    // Os rótulos dizem "todas as formas" porque este total soma cartão e PIX,
    // que não estão na gaveta. O valor conferível fisicamente é o do bloco
    // "Dinheiro na gaveta".
    linhas.push({
      label: "Total do dia calculado pelo sistema (todas as formas)",
      valor: fmtBRL(input.saldoCalculado ?? 0),
    });
    if (temRetro) {
      linhas.push({
        label: retroRotulo,
        valor: fmtBRL(retro!.total),
        descricao: retroNota,
      });
    }
    linhas.push({
      label: "Total do dia conferido (todas as formas)",
      valor: fmtBRL(input.valorInformado ?? input.valor),
    });
    linhas.push({
      label: difRotulo,
      valor: fmtBRL(difValor),
      destaque: Math.abs(difValor) > 0.009,
    });
    if (temRegs) {
      linhas.push({
        label: regsRotulo,
        valor: fmtBRL(regs!.total),
        descricao: regsNota,
      });
    }
  } else {
    linhas.push({ label: "Valor", valor: fmtBRL(input.valor), destaque: true });
  }

  // Tabela por forma: entradas, saídas e saldo. Nenhuma linha é escondida por
  // ter fechado em zero (era o que apagava o Dinheiro em dia de sangria total)
  // nem por ter saldo negativo — a linha negativa é justamente a que precisa
  // ser vista na conferência.
  const formasLinhas = isFech ? linhasPorForma(input) : [];
  const totalEntradas = formasLinhas.reduce((s, l) => s + l.entradas, 0);
  const totalSaidas = formasLinhas.reduce((s, l) => s + l.saidas, 0);
  const totalSaldo = totalEntradas - totalSaidas;

  const gavetaLinhas = isFech ? linhasGaveta(input) : [];
  const esperadoGaveta = isFech ? esperadoEmEspecie(input) : undefined;
  const temBlocoGaveta = gavetaLinhas.length > 0 && typeof esperadoGaveta === "number";

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
       ${!temBlocoGaveta && typeof input.saldoInicial === "number" ? linha80("Saldo inicial (troco)", fmtBRL(input.saldoInicial)) : ""}
       ${!temBlocoGaveta && typeof input.esperadoGaveta === "number" ? linha80("Esperado em espécie", fmtBRL(input.esperadoGaveta)) : ""}`
      : "";

    // Vem antes da conferência do dia porque é o único valor que a atendente
    // confere contando: o total do dia, logo abaixo, inclui cartão e PIX.
    const gavetaBlock = temBlocoGaveta
      ? `${secao80("Dinheiro na gaveta (espécie)")}
       ${gavetaLinhas
         .map((l) =>
           linha80(
             l.label,
             `${l.valor < 0 ? "− " : "+ "}${fmtBRL(Math.abs(l.valor))}`,
             l.valor < 0,
           ),
         )
         .join("")}
       ${destaque80("Esperado na gaveta (só dinheiro)", fmtBRL(esperadoGaveta))}
       <div class="nota">Conte a gaveta contra este valor. Cartões e PIX não passam pela gaveta.</div>`
      : "";

    const conferenciaBlock = isFech
      ? `${secao80("Conferência do dia (todas as formas)")}
       ${linha80("Total do dia calculado (com cartão e PIX)", fmtBRL(input.saldoCalculado ?? 0))}
       ${temRetro ? linha80(retroRotulo, fmtBRL(retro!.total)) : ""}
       ${temRetro ? `<div class="nota">${esc(retroNota)}</div>` : ""}
       ${linha80("Total do dia conferido (com cartão e PIX)", fmtBRL(input.valorInformado ?? input.valor), true)}
       ${destaque80(difRotulo, fmtBRL(difValor), !difConfere)}
       ${temRegs ? linha80(regsRotulo, fmtBRL(regs!.total)) : ""}
       ${temRegs ? `<div class="nota">${esc(regsNota)}</div>` : ""}`
      : destaque80("Valor", fmtBRL(input.valor));

    const formasBlock = formasLinhas.length
      ? `${secao80("Por forma de pagamento (R$)")}
       <table class="formas">
         <thead>
           <tr><th>Forma</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr>
         </thead>
         <tbody>
           ${formasLinhas
             .map(
               (l) => `<tr>
             <td>${esc(formaLabelCurto(l.chave))}</td>
             <td class="n">${esc(fmtNum(l.entradas))}</td>
             <td class="n">${esc(fmtNum(l.saidas))}</td>
             <td class="n">${esc(fmtNum(l.saldo))}</td>
           </tr>`,
             )
             .join("")}
         </tbody>
         <tfoot>
           <tr>
             <td>Total</td>
             <td class="n">${esc(fmtNum(totalEntradas))}</td>
             <td class="n">${esc(fmtNum(totalSaidas))}</td>
             <td class="n">${esc(fmtNum(totalSaldo))}</td>
           </tr>
         </tfoot>
       </table>
       <div class="nota">Entradas = bruto recebido na forma. Saldo = entradas − saídas.</div>`
      : "";

    const movsBlock = movs.length
      ? `${secao80("Sangrias e suprimentos (detalhe)")}
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

  /* ---- tabela por forma de pagamento (entradas / saídas / saldo) ----
     4 colunas em 72mm só cabem com fonte 8px e rótulo curto; os números
     usam tabular-nums para as casas decimais ficarem alinhadas na coluna. */
  table.formas { width: 100%; border-collapse: collapse; margin-top: 3px;
    font-size: 8px; font-variant-numeric: tabular-nums; }
  table.formas th, table.formas td { padding: 1.5px 0; white-space: nowrap; }
  table.formas th { font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .3px; border-bottom: 1px solid #000; text-align: right; }
  table.formas th:first-child, table.formas td:first-child { text-align: left;
    padding-right: 3px; white-space: normal; overflow-wrap: anywhere; }
  table.formas td.n { text-align: right; padding-left: 3px; }
  table.formas tfoot td { border-top: 1px solid #000; font-weight: 800; padding-top: 2px; }

  /* ---- itens com descrição (sangrias/suprimentos) ---- */
  .item { margin-top: 3px; }
  .item-desc { font-size: 9px; padding-left: 6px; word-break: break-word; }

  .desc { font-size: 9.5px; line-height: 1.45; margin-top: 3px;
    white-space: pre-wrap; word-break: break-word; }

  /* ---- nota explicativa curta abaixo de um bloco ---- */
  .nota { font-size: 8px; line-height: 1.35; margin-top: 3px; font-style: italic; }

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
    ${gavetaBlock}
    ${formasBlock}
    ${conferenciaBlock}
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
    // Sem o bloco da gaveta (comprovante antigo, sem composição informada)
    // estes dois campos continuam sendo a única pista do dinheiro físico.
    if (!temBlocoGaveta && typeof input.saldoInicial === "number")
      campos.push(campoA4("Saldo inicial (troco)", fmtBRL(input.saldoInicial)));
    if (!temBlocoGaveta && typeof input.esperadoGaveta === "number")
      campos.push(campoA4("Esperado em espécie", fmtBRL(input.esperadoGaveta)));
  } else if (input.destinoNome) {
    campos.push(campoA4(rotuloDestino, input.destinoNome));
  }

  /** Conta do dinheiro físico, aberta linha a linha, com o esperado em total. */
  const gavetaSecao = temBlocoGaveta
    ? `<div class="secao">
        <div class="rot">Dinheiro na gaveta (espécie)</div>
        ${gavetaLinhas
          .map((l) =>
            linhaValorA4(l.label, `${l.valor < 0 ? "− " : "+ "}${fmtBRL(Math.abs(l.valor))}`),
          )
          .join("")}
        ${linhaValorA4("Esperado na gaveta (só dinheiro)", fmtBRL(esperadoGaveta), {
          total: true,
          destaque: true,
          descricao: "Conte a gaveta contra este valor — cartões e PIX não passam por ela.",
        })}
      </div>`
    : "";

  const valorBox = isFech
    ? `<div class="secao">
        <div class="rot">Conferência do dia (todas as formas)</div>
        ${linhas.map((l) => linhaValorA4(l.label, l.valor, { destaque: l.destaque, descricao: l.descricao })).join("")}
      </div>`
    : `<div class="valor-box">
        <div class="rot">Valor</div>
        <div class="valor">${esc(fmtBRL(input.valor))}</div>
      </div>`;

  const formasSecao = formasLinhas.length
    ? `<div class="secao">
        <div class="rot">Por forma de pagamento (valores em R$)</div>
        <table class="formas">
          <thead>
            <tr><th>Forma</th><th>Entradas (bruto)</th><th>Saídas</th><th>Saldo</th></tr>
          </thead>
          <tbody>
            ${formasLinhas
              .map(
                (l) => `<tr>
              <td>${esc(formaLabel(l.chave))}</td>
              <td class="n">${esc(fmtNum(l.entradas))}</td>
              <td class="n">${esc(fmtNum(l.saidas))}</td>
              <td class="n">${esc(fmtNum(l.saldo))}</td>
            </tr>`,
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="n">${esc(fmtNum(totalEntradas))}</td>
              <td class="n">${esc(fmtNum(totalSaidas))}</td>
              <td class="n">${esc(fmtNum(totalSaldo))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`
    : "";

  const movsSecao = movs.length
    ? `<div class="secao">
        <div class="rot">Sangrias e suprimentos do turno (detalhe)</div>
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

      ${isFech ? "" : valorBox}

      <div class="grade">
        ${campos.join("")}
      </div>

      ${gavetaSecao}
      ${formasSecao}
      ${isFech ? valorBox : ""}
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

  /** Tabela por forma na folha A4 — as classes base não têm estilo de tabela. */
  const cssTabelaA4 = `
  table.formas { width: 100%; border-collapse: collapse; margin-top: 6px;
    font-size: 12pt; font-variant-numeric: tabular-nums; }
  table.formas th, table.formas td { padding: 6px 0; }
  table.formas th { font-size: 8.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: #52525b; text-align: right;
    border-bottom: 1px solid #a1a1aa; }
  table.formas th:first-child, table.formas td:first-child { text-align: left; }
  table.formas td { border-bottom: 1px dotted #a1a1aa; }
  table.formas td.n { text-align: right; padding-left: 16px; white-space: nowrap; }
  table.formas tfoot td { border-bottom: none; border-top: 1.5px solid #18181b;
    font-weight: 800; }`;

  return documentoA4(titulo, corpoA4, CSS_DOC_A4 + cssTabelaA4);
}

export function printComprovanteCaixa(input: ComprovanteCaixaInput) {
  printHtmlViaIframe(buildComprovanteCaixaHtml(input));
}
