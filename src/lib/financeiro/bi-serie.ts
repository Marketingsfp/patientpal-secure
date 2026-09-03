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

const MESES_PT = [
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
