/**
 * Agrupamento da série do BI Financeiro (receitas x despesas) conforme o
 * período escolhido nas pílulas Dia/Semana/Quinzena/Mês/Período.
 *
 * A tela antes mostrava sempre seis meses fechados, então bastava somar por
 * `YYYY-MM`. Com o filtro de data isso deixou de servir: em "Dia" ou "Semana"
 * o mês inteiro vira uma barra só e o gráfico não diz nada. Aqui o recorte
 * decide a granularidade — intervalo curto vira uma barra por dia, intervalo
 * longo vira uma barra por mês.
 *
 * As datas são tratadas como texto `YYYY-MM-DD` e a aritmética é feita em UTC,
 * pelo mesmo motivo de `@/lib/financeiro/preset-periodo`: o mesmo código roda
 * no navegador da clínica (BRT) e no Worker do SSR (UTC), e um `new Date` local
 * empurraria a barra para o dia anterior.
 */
import type { DateRange } from "./preset-periodo";

/** Acima disso o gráfico viraria uma parede de barras finas: agrupa por mês. */
const MAX_DIAS_POR_DIA = 62;

export type Granularidade = "dia" | "mes";

/** Uma barra do gráfico. `chave` é `YYYY-MM-DD` ou `YYYY-MM`. */
export interface PontoSerie {
  chave: string;
  label: string;
  receitas: number;
  despesas: number;
}

/** Linha crua devolvida pela RPC `fin_serie_diaria`. */
export interface LinhaSerieDiaria {
  data: string;
  tipo: string;
  total: number | string;
}

export const MESES_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const DIA_MS = 86400000;

/** Dia por dia até 62 dias; daí para cima, mês por mês. */
export function granularidadeDoIntervalo(r: DateRange): Granularidade {
  const dias = Math.round((ms(r.to) - ms(r.from)) / DIA_MS) + 1;
  return Number.isFinite(dias) && dias <= MAX_DIAS_POR_DIA ? "dia" : "mes";
}

/**
 * As barras vazias do intervalo, em ordem. Existem para que um dia sem
 * movimento apareça como zero no gráfico em vez de desaparecer do eixo —
 * buraco no eixo já foi lido pela recepção como "o sistema perdeu o dia".
 */
function bucketsDoIntervalo(r: DateRange, g: Granularidade): PontoSerie[] {
  const ini = ms(r.from);
  const fim = ms(r.to);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return [];
  const out: PontoSerie[] = [];
  if (g === "dia") {
    for (let t = ini; t <= fim; t += DIA_MS) {
      const chave = new Date(t).toISOString().slice(0, 10);
      out.push({
        chave,
        label: `${chave.slice(8, 10)}/${chave.slice(5, 7)}`,
        receitas: 0,
        despesas: 0,
      });
    }
    return out;
  }
  const d = new Date(ini);
  let ano = d.getUTCFullYear();
  let mes = d.getUTCMonth();
  const dFim = new Date(fim);
  const ultimo = dFim.getUTCFullYear() * 12 + dFim.getUTCMonth();
  while (ano * 12 + mes <= ultimo) {
    out.push({
      chave: `${ano}-${String(mes + 1).padStart(2, "0")}`,
      label: `${MESES_PT[mes]}/${String(ano).slice(2)}`,
      receitas: 0,
      despesas: 0,
    });
    mes += 1;
    if (mes === 12) {
      mes = 0;
      ano += 1;
    }
  }
  return out;
}

/**
 * Soma as linhas da RPC nas barras do intervalo. Linha fora do intervalo é
 * descartada — a RPC pode devolver borda por causa de fuso, e somar isso
 * inflaria o total mostrado no cartão.
 */
export function agruparSerie(
  rows: LinhaSerieDiaria[] | null | undefined,
  r: DateRange,
  granularidade: Granularidade = granularidadeDoIntervalo(r),
): PontoSerie[] {
  const buckets = bucketsDoIntervalo(r, granularidade);
  const porChave = new Map(buckets.map((b) => [b.chave, b]));
  for (const linha of rows ?? []) {
    const data = String(linha?.data ?? "").slice(0, 10);
    if (!data || data < r.from || data > r.to) continue;
    const chave = granularidade === "dia" ? data : data.slice(0, 7);
    const b = porChave.get(chave);
    if (!b) continue;
    const valor = Number(linha.total) || 0;
    if (linha.tipo === "receita") b.receitas += valor;
    else if (linha.tipo === "despesa") b.despesas += valor;
  }
  return buckets;
}

/** Totais do período — o que os três cartões do topo mostram. */
export function totaisDaSerie(pontos: PontoSerie[]): {
  receitas: number;
  despesas: number;
  saldo: number;
} {
  const receitas = pontos.reduce((s, p) => s + p.receitas, 0);
  const despesas = pontos.reduce((s, p) => s + p.despesas, 0);
  return { receitas, despesas, saldo: receitas - despesas };
}

/* -------------------------------------------------------------------------
 * Atendimentos por mês (RPC `fin_atendimentos_matriz`)
 *
 * ATENÇÃO: a função do banco devolve `mes` de 0 a 11, não de 1 a 12 — ela faz
 * `EXTRACT(MONTH FROM data) - 1` para o número já servir de índice de array em
 * JavaScript. Somar 1 aqui desloca o gráfico um mês inteiro.
 * ------------------------------------------------------------------------- */

/** Linha crua devolvida pela RPC `fin_atendimentos_matriz`. */
export interface LinhaMatriz {
  ano: number | string;
  mes: number | string;
  cartao: number | string;
  particular: number | string;
  exames: number | string;
}

/** Uma célula da tabela ano × mês. */
export interface CelulaAtend {
  cartao: number;
  particular: number;
  exames: number;
  total: number;
}

export interface MatrizAtend {
  anos: number[];
  linhas: Array<{ mesIdx: number; porAno: Record<number, CelulaAtend> }>;
  totalPorAno: Record<number, CelulaAtend>;
  totalGeral: number;
}

const celulaVazia = (): CelulaAtend => ({ cartao: 0, particular: 0, exames: 0, total: 0 });

/** Indexa as linhas da RPC por ano e mês (0–11). */
function indexar(
  rows: LinhaMatriz[] | null | undefined,
): Record<number, Record<number, CelulaAtend>> {
  const matriz: Record<number, Record<number, CelulaAtend>> = {};
  for (const r of rows ?? []) {
    const ano = Number(r?.ano);
    const mes = Number(r?.mes);
    if (!Number.isFinite(ano) || !Number.isFinite(mes) || mes < 0 || mes > 11) continue;
    const cartao = Number(r.cartao) || 0;
    const particular = Number(r.particular) || 0;
    const exames = Number(r.exames) || 0;
    if (!matriz[ano]) matriz[ano] = {};
    matriz[ano][mes] = { cartao, particular, exames, total: cartao + particular + exames };
  }
  return matriz;
}

/** A tabela ano × mês da janela de detalhe, com os totais por ano. */
export function matrizAtendimentos(rows: LinhaMatriz[] | null | undefined): MatrizAtend {
  const matriz = indexar(rows);
  const anos = Object.keys(matriz)
    .map(Number)
    .sort((a, b) => a - b);
  const linhas = Array.from({ length: 12 }, (_, m) => {
    const porAno: Record<number, CelulaAtend> = {};
    for (const a of anos) porAno[a] = matriz[a][m] ?? celulaVazia();
    return { mesIdx: m, porAno };
  });
  const totalPorAno: Record<number, CelulaAtend> = {};
  for (const a of anos) {
    const t = celulaVazia();
    for (const l of linhas) {
      const c = l.porAno[a];
      t.cartao += c.cartao;
      t.particular += c.particular;
      t.exames += c.exames;
      t.total += c.total;
    }
    totalPorAno[a] = t;
  }
  const totalGeral = Object.values(totalPorAno).reduce((s, v) => s + v.total, 0);
  return { anos, linhas, totalPorAno, totalGeral };
}

export interface PontoAtend {
  label: string;
  cartao: number;
  particular: number;
  exames: number;
}

/**
 * A série do gráfico: os últimos `meses` meses terminando no mês de `ref`,
 * em ordem. Mês sem linha na RPC entra como zero, para o eixo não pular mês.
 */
export function serieAtendimentos(
  rows: LinhaMatriz[] | null | undefined,
  meses = 12,
  ref: Date = new Date(),
): PontoAtend[] {
  const matriz = indexar(rows);
  const out: PontoAtend[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mes = d.getMonth();
    const c = matriz[ano]?.[mes] ?? celulaVazia();
    out.push({
      label: `${MESES_PT[mes]}/${String(ano).slice(2)}`,
      cartao: c.cartao,
      particular: c.particular,
      exames: c.exames,
    });
  }
  return out;
}

/**
 * A janela de datas que a série do gráfico precisa: do dia 1 do mês mais
 * antigo até hoje. Sem isso a RPC varre o histórico inteiro da clínica.
 */
export function janelaDaSerie(meses = 12, ref: Date = new Date()): DateRange {
  const ini = new Date(ref.getFullYear(), ref.getMonth() - (meses - 1), 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(ini), to: iso(ref) };
}
