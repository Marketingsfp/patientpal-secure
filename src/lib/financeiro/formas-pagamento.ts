/**
 * Classificação canônica das formas de pagamento do financeiro.
 *
 * `fin_lancamentos.forma_pagamento` é texto livre e carrega três gerações de
 * dados no mesmo campo:
 *
 *   - sistema atual: `dinheiro`, `pix`, `cartao_debito`, `cartao_credito`,
 *     `misto`, `convenio_gratuidade`;
 *   - importação do sistema antigo: a BANDEIRA do cartão no lugar do tipo
 *     (`MASTER`, `VISA`, `MAESTRO`, `ELO`, `AMERICAN`), o caixa de origem no
 *     dinheiro (`DINHEIRO CX4`, `DINHEIRO F2`, `CAIXA 10`) e o banco na
 *     transferência (`INTERNET BANKING`, `DEPOSITO - BRADESCO`);
 *   - lançamentos sem forma preenchida (NULL).
 *
 * Sem uma classificação única, o Fechamento de Caixa listava cada texto como
 * uma linha própria — `CARTAO_CREDITO`, `MASTER` e `VISA` apareciam separados
 * — e o filtro de Crédito não alcançava nenhuma bandeira antiga (enquanto o
 * de Débito já pegava MAESTRO), então os dois cartões nunca fechavam com o
 * comprovante do sistema antigo. Este módulo é a fonte única da verdade:
 * débito e crédito são baldes independentes e nenhum texto cai nos dois.
 *
 * Regra do cartão importado: TODO texto de cartão que veio da importação —
 * as bandeiras (MASTER, VISA, MAESTRO, ELO, AMERICAN…) e o "Cartão" genérico,
 * sem bandeira e sem tipo — vai para uma linha própria, "Parcelas do sistema
 * antigo", e nunca é somado ao Cartão de Débito nem ao Cartão de Crédito.
 *
 * O motivo é a conferência diária da maquininha. O sistema antigo gravava em
 * `data` a data em que cada PARCELA cai, não a data da venda, e há parcelas
 * lançadas até dezembro/2026. Elas pousavam no dia de hoje e entravam no
 * Cartão de Crédito do relatório do dia sem ter passado na maquininha: em
 * 18/08/2026 eram R$ 555,00 e em 17/08/2026, R$ 1.163,00. Separadas, as
 * linhas de Débito e de Crédito passam a conter só o que o sistema atual
 * registrou (`cartao_debito`, `cartao_credito` e as partes de "misto"), que é
 * exatamente o que a recepção confere contra a maquininha. Nenhum valor some
 * do relatório: o dinheiro antigo continua visível na sua própria linha, com
 * os textos de origem listados ao lado.
 *
 * O débito segue a mesma regra por coerência, embora na prática não mude o
 * dia a dia: MAESTRO, o débito do sistema antigo, não tem lançamento depois
 * de 02/06/2026 — débito não é parcelado.
 */

export type FormaCanonica =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "legado_cartao"
  | "boleto"
  | "transferencia"
  | "convenio"
  | "misto"
  | "outros"
  | "sem_informacao";

export const LABEL_FORMA: Record<FormaCanonica, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de Débito",
  credito: "Cartão de Crédito",
  legado_cartao: "Parcelas do sistema antigo",
  boleto: "Boleto",
  transferencia: "Transferência / Depósito",
  convenio: "Convênio / Gratuidade",
  misto: "Misto (não decomposto)",
  outros: "Outros",
  sem_informacao: "Sem informação",
};

/** Ordem fixa das linhas no Fechamento de Caixa. */
export const ORDEM_FORMAS: FormaCanonica[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "legado_cartao",
  "boleto",
  "transferencia",
  "convenio",
  "misto",
  "outros",
  "sem_informacao",
];

/**
 * Linhas que aparecem sempre no relatório, mesmo zeradas. Débito e crédito
 * entram aqui de propósito: a conferência com a maquininha exige ver os dois
 * separados, inclusive quando um deles não teve movimento no período.
 */
export const FORMAS_SEMPRE_VISIVEIS: FormaCanonica[] = ["dinheiro", "pix", "debito", "credito"];

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Texto do banco → chave comparável: sem acento, minúsculo, `_`/`-` viram espaço. */
function normalizar(raw: string | null | undefined): string {
  return semAcento(String(raw ?? ""))
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Textos de cartão que só a importação do sistema antigo produz: a BANDEIRA
 * no lugar do tipo. O sistema atual nunca grava assim — ele grava
 * `cartao_debito`/`cartao_credito` em `forma_pagamento` e guarda a bandeira
 * no campo `bandeira_cartao`, à parte. Por isso o texto sozinho já identifica
 * o lançamento como herdado.
 */
const BANDEIRAS_LEGADO =
  /\b(maestro|electron|master|mastercard|visa|elo|american|amex|hipercard|diners)\b/;

/**
 * Classifica qualquer texto de forma de pagamento em um único balde.
 *
 * A ordem dos testes importa: o TIPO escrito por extenso ("debito",
 * "credito") vence a bandeira, para que `cartao_debito` e "CARTÃO CRÉDITO
 * (VISA)" caiam no cartão certo do sistema atual. Só depois disso um texto
 * puramente de bandeira — ou um "Cartão" genérico, sem bandeira e sem tipo —
 * é reconhecido como herança da importação.
 */
export function classificarForma(raw: string | null | undefined): FormaCanonica {
  const k = normalizar(raw);
  if (!k) return "sem_informacao";
  if (k === "misto") return "misto";
  if (/\bdinheiro\b/.test(k) || /^caixa\b/.test(k) || /^cx\b/.test(k) || /\bespecie\b/.test(k)) {
    return "dinheiro";
  }
  if (/\bpix\b/.test(k)) return "pix";
  if (/\bdebito\b/.test(k)) return "debito";
  if (/\bcredito\b/.test(k)) return "credito";
  if (BANDEIRAS_LEGADO.test(k) || /\bcart(ao|oes)\b/.test(k)) return "legado_cartao";
  if (/\bboleto\b/.test(k)) return "boleto";
  if (/\b(transferencia|banking|deposito|ted|doc)\b/.test(k)) return "transferencia";
  if (/\b(convenio|gratuidade|associado)\b/.test(k) || /sem cobranca/.test(k)) return "convenio";
  return "outros";
}

/**
 * Reconhece uma CATEGORIA financeira de gratuidade — "CORTESIA",
 * "GRATUIDADE", "ISENTO"/"ISENÇÃO", "SEM COBRANÇA".
 *
 * Serve à tela de cobrança (Nova Receita): nessas categorias o atendimento é
 * liberado sem cobrar nada, então o total é zerado automaticamente e a tela
 * para de exigir dinheiro, cartão ou valor recebido. Antes disso, escolher
 * "CORTESIA" mantinha o valor cheio do procedimento e o rodapé acusava
 * "Falta: R$ 148,50", travando o "Salvar e imprimir" de um atendimento que
 * por definição não tem nada a receber.
 *
 * O casamento é por palavra inteira, de propósito: categoria que apenas
 * menciona convênio ("CONVENIOS", "EXAME CARTAO CONSULTA") continua sendo
 * cobrança normal e não pode cair aqui — quem concede gratuidade pelo
 * convênio é a regra do Cartão Benefícios, não o nome da categoria.
 *
 * Não confundir com `classificarForma`, que classifica a FORMA de pagamento
 * gravada no lançamento; esta função olha o nome da categoria.
 */
export function categoriaEhGratuidade(nome: string | null | undefined): boolean {
  const k = normalizar(nome);
  if (!k) return false;
  if (/sem cobranca/.test(k)) return true;
  return /\b(cortesia|gratuidade|gratuito|gratuita|gratis|isento|isenta|isencao)\b/.test(k);
}

export interface ParteMisto {
  forma: FormaCanonica;
  valor: number;
}

const parseBRL = (s: string): number =>
  Number(s.replace(/[.\s\u00a0]/g, "").replace(",", ".")) || 0;

/**
 * Decompõe um pagamento "misto" nas formas reais.
 *
 * A fonte confiável é `fin_lancamentos.composicao_pagamento` (JSON gravado
 * pela tela de lançamento, com `partes: [{forma, valor}]`). O texto de
 * `observacoes` — "PAGAMENTO MISTO: DINHEIRO R$ 50,00; CARTAO DEBITO R$ 70,00"
 * — só é retaguarda para lançamentos gravados antes de o JSON existir.
 *
 * A leitura do texto tinha um defeito que zerava a decomposição inteira: o
 * rótulo era capturado por `[^R$]+?`, classe que (com o flag /i) recusa a
 * letra "r" — ou seja DINHEIRO, CARTAO DEBITO e CARTAO CREDITO nunca casavam,
 * e o lançamento seguia contado como "MISTO", fora do débito e do crédito.
 */
export function partesDoPagamentoMisto(
  forma: string | null | undefined,
  observacoes: string | null | undefined,
  composicao?: unknown,
): ParteMisto[] {
  if (classificarForma(forma) !== "misto") return [];

  const doJson = partesDoJson(composicao);
  if (doJson.length) return doJson;

  if (!observacoes) return [];
  const idx = observacoes.toLowerCase().indexOf("misto:");
  const trecho = idx >= 0 ? observacoes.slice(idx + "misto:".length) : observacoes;
  const primeiroBloco = trecho.split(" | ")[0];
  const partes: ParteMisto[] = [];
  for (const bruto of primeiroBloco.split(";")) {
    const m = bruto.match(/^\s*(.+?)\s*R\$\s*([\d.\s\u00a0]*\d(?:,\d{1,2})?)/i);
    if (!m) continue;
    const valor = parseBRL(m[2]);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    partes.push({ forma: classificarForma(m[1]), valor });
  }
  return partes;
}

function partesDoJson(composicao: unknown): ParteMisto[] {
  if (!composicao || typeof composicao !== "object") return [];
  const arr = (composicao as { partes?: unknown }).partes;
  if (!Array.isArray(arr)) return [];
  const out: ParteMisto[] = [];
  for (const p of arr as Array<{ forma?: string; valor?: number | string }>) {
    const valor = Number(p?.valor ?? 0);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    out.push({ forma: classificarForma(p?.forma), valor });
  }
  return out;
}

/** Opções do filtro "Forma de pagamento" da tela de Movimento de Caixa. */
export type FiltroForma =
  | "todos"
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "cartao"
  | "legado"
  | "boleto"
  | "sem";

/**
 * Quais baldes cada opção do filtro aceita. Débito e crédito não se cruzam, e
 * nenhum dos dois alcança o cartão importado — para isso existe "legado".
 * "Cartão (qualquer)" continua sendo a opção que junta tudo, para quem só quer
 * saber quanto passou em cartão no período, sem separar geração nem tipo.
 */
const FILTRO_ACEITA: Record<Exclude<FiltroForma, "todos">, FormaCanonica[]> = {
  dinheiro: ["dinheiro"],
  pix: ["pix"],
  debito: ["debito"],
  credito: ["credito"],
  cartao: ["debito", "credito", "legado_cartao"],
  legado: ["legado_cartao"],
  boleto: ["boleto", "transferencia"],
  sem: ["sem_informacao"],
};

/** true → o texto gravado no banco pertence ao filtro escolhido. */
export function formaCasaComFiltro(raw: string | null | undefined, filtro: FiltroForma): boolean {
  if (filtro === "todos") return true;
  return FILTRO_ACEITA[filtro].includes(classificarForma(raw));
}

/** true → o balde já classificado pertence ao filtro escolhido. */
export function baldeCasaComFiltro(forma: FormaCanonica, filtro: FiltroForma): boolean {
  if (filtro === "todos") return true;
  return FILTRO_ACEITA[filtro].includes(forma);
}

/**
 * Recorte grosseiro do filtro no PostgREST, só para não trazer o período
 * inteiro do banco. Pode ser mais largo que `formaCasaComFiltro` — a
 * separação exata é feita no cliente, com `classificarForma`, que é a única
 * regra que vale. Retorna `null` quando não há filtro a aplicar.
 *
 * O que ele NÃO pode ser é largo à toa. Enquanto Débito e Crédito puxavam
 * também as bandeiras antigas, um filtro de Crédito num período longo trazia
 * dezenas de milhares de linhas herdadas só para descartá-las no cliente — e,
 * com o teto de 20.000 linhas da consulta, as linhas de crédito de verdade
 * podiam nem chegar. Agora cada bandeira é buscada apenas pelo filtro que
 * realmente a usa: "legado".
 *
 * `incluirMisto` traz também os pagamentos mistos, que podem conter uma parte
 * da forma procurada — as partes que não interessam são descartadas depois.
 */
export function filtroFormaPostgrest(filtro: FiltroForma, incluirMisto: boolean): string | null {
  const campo = "forma_pagamento";
  const like = (p: string) => `${campo}.ilike.${p}`;
  const misto = incluirMisto ? [`${campo}.eq.misto`] : [];
  const dinheiro = [like("%dinheiro%"), like("caixa%"), like("cx%"), like("%especie%")];
  const debito = [like("%debito%"), like("%débito%")];
  const credito = [like("%credito%"), like("%crédito%")];
  const legado = [
    like("maestro%"),
    like("%electron%"),
    like("master%"),
    like("visa%"),
    like("elo%"),
    like("american%"),
    like("amex%"),
    like("hipercard%"),
    like("diners%"),
    like("%cart%"),
  ];
  switch (filtro) {
    case "dinheiro":
      return [...dinheiro, ...misto].join(",");
    case "pix":
      return [like("%pix%"), ...misto].join(",");
    case "debito":
      return [...debito, ...misto].join(",");
    case "credito":
      return [...credito, ...misto].join(",");
    case "legado":
      return legado.join(",");
    case "cartao":
      return [...debito, ...credito, ...legado, ...misto].join(",");
    case "boleto":
      return [
        like("%boleto%"),
        like("%banking%"),
        like("%transfer%"),
        like("%deposito%"),
        like("%depósito%"),
      ].join(",");
    case "sem":
      return `${campo}.is.null,${campo}.eq.`;
    default:
      return null;
  }
}
