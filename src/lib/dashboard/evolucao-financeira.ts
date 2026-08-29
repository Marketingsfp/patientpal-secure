/**
 * Evolução Financeira do ano — Receita x Despesa, mês a mês.
 *
 * A origem é a função `fin_serie_diaria` do banco, que já é usada pelo
 * Financeiro Analítico e pelo BI. Ela devolve UMA linha por dia e por tipo
 * (receita/despesa) e faz a soma dentro do banco — é o que impede o corte de
 * 1.000 linhas: um ano inteiro cabe em no máximo 732 linhas (366 dias x 2
 * tipos), enquanto ler os lançamentos crus seriam dezenas de milhares.
 *
 * Aqui só agrupamos os dias em meses. Função pura, sem banco e sem React, para
 * poder ser testada.
 */

/** Linha crua de `fin_serie_diaria`. */
export interface SerieDiariaRow {
  /** Data no formato AAAA-MM-DD (ou ISO completo — só os 10 primeiros contam). */
  data: string;
  /** "receita" ou "despesa". */
  tipo: string;
  total: number | null;
}

export interface EvolucaoMensal {
  /** Rótulos curtos do eixo X, na ordem dos meses: "jan", "fev"… */
  labels: string[];
  /** Chave AAAA-MM de cada mês, na mesma ordem dos labels. */
  meses: string[];
  /** Receita confirmada de cada mês. */
  receitas: number[];
  /** Despesa confirmada de cada mês. */
  despesas: number[];
  /** Receita − despesa de cada mês. */
  resultados: number[];
  /** Soma do ano inteiro, para a legenda do card. */
  totalReceita: number;
  totalDespesa: number;
}

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Agrupa a série diária nos 12 meses do ano pedido.
 *
 * Os meses aparecem TODOS, mesmo os sem lançamento — um gráfico que pula
 * fevereiro dá a impressão de que fevereiro não existiu, quando o certo é
 * mostrar a barra zerada. Linhas de outros anos são descartadas: a função do
 * banco é chamada com o intervalo do ano, mas descartar aqui também deixa o
 * gráfico correto se um dia alguém passar um intervalo maior.
 *
 * @param linhas retorno de `fin_serie_diaria`.
 * @param ano ano de referência (ex.: 2026).
 * @param ateMes último mês a exibir (1–12). Serve para não desenhar meses que
 *   ainda não aconteceram. Sem valor, mostra os 12.
 */
export function agruparEvolucaoMensal(
  linhas: readonly SerieDiariaRow[],
  ano: number,
  ateMes = 12,
): EvolucaoMensal {
  const limite = Math.min(12, Math.max(1, Math.trunc(ateMes)));
  const receitas = Array<number>(limite).fill(0);
  const despesas = Array<number>(limite).fill(0);

  for (const l of linhas) {
    const dia = (l.data ?? "").slice(0, 10);
    if (dia.slice(0, 4) !== String(ano)) continue;
    const mes = Number(dia.slice(5, 7));
    if (!Number.isFinite(mes) || mes < 1 || mes > limite) continue;
    const tipo = (l.tipo ?? "").toLowerCase();
    if (tipo === "receita") receitas[mes - 1] += num(l.total);
    else if (tipo === "despesa") despesas[mes - 1] += num(l.total);
  }

  return {
    labels: MESES_CURTOS.slice(0, limite),
    meses: Array.from({ length: limite }, (_, i) => `${ano}-${pad2(i + 1)}`),
    receitas,
    despesas,
    resultados: receitas.map((r, i) => r - despesas[i]),
    totalReceita: receitas.reduce((s, v) => s + v, 0),
    totalDespesa: despesas.reduce((s, v) => s + v, 0),
  };
}
