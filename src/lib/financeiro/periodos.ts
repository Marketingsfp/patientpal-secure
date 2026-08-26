/**
 * Cálculo do período de comparação dos relatórios.
 *
 * Tudo aqui trabalha com data pura no formato YYYY-MM-DD e nunca constrói um
 * `Date` no fuso do runtime: o mesmo código roda no navegador da clínica
 * (BRT) e no Worker do SSR (UTC), e `new Date("2026-08-26")` volta em dias
 * diferentes nos dois. Quem escolhe o período em si é o seletor de datas da
 * tela (`@/components/date-range-filter`); aqui só se calcula o intervalo com
 * que ele será confrontado.
 */
export type Periodo = { de: string; ate: string };

/** Como o período de comparação é montado. */
export type ModoComparacao = "anterior" | "ano-anterior" | "personalizado";

/** Soma dias a uma data pura, em calendário. */
export const addDias = (iso: string, d: number) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
};

/** Distância em dias entre duas datas puras (b - a). */
export const diffDias = (a: string, b: string) => {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
};

/** Quantos dias o período cobre, contando as duas pontas. */
export const diasDoPeriodo = (p: Periodo) => diffDias(p.de, p.ate) + 1;

/** Último dia do mês da data informada. */
export const ultimoDiaDoMes = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/**
 * Mesma data um ano antes. 29/02 não existe no ano anterior, então a data é
 * puxada para 28/02 em vez de escorregar para 1º de março — um relatório de
 * fevereiro não pode acabar em março.
 */
export const mesmoDiaAnoAnterior = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const ultimo = Number(ultimoDiaDoMes(`${y - 1}-${String(m).padStart(2, "0")}-01`).slice(8));
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
};

/**
 * Período com que o atual será comparado.
 *
 * - `anterior`: a mesma quantidade de dias, encostada logo antes do período.
 *   Um relatório de 15 dias compara com os 15 dias imediatamente anteriores.
 * - `ano-anterior`: as mesmas datas no ano passado (agosto/2026 x agosto/2025).
 * - `personalizado`: o intervalo que o usuário digitou, devolvido como veio.
 */
export function periodoComparacao(
  atual: Periodo,
  modo: ModoComparacao,
  personalizado?: Periodo,
): Periodo {
  if (modo === "personalizado") {
    return personalizado ?? atual;
  }
  if (modo === "ano-anterior") {
    return { de: mesmoDiaAnoAnterior(atual.de), ate: mesmoDiaAnoAnterior(atual.ate) };
  }
  const dias = diasDoPeriodo(atual);
  return { de: addDias(atual.de, -dias), ate: addDias(atual.de, -1) };
}

/**
 * Variação entre dois valores.
 *
 * Devolve `null` no percentual quando não havia base de comparação (anterior
 * igual a zero): mostrar "0%" ali se lê como estabilidade e engana quem
 * confere — foi o mesmo cuidado tomado no Painel Executivo.
 */
export function variacao(
  atual: number,
  anterior: number,
): { valor: number; percentual: number | null } {
  const valor = +(atual - anterior).toFixed(2);
  if (anterior === 0) return { valor, percentual: atual === 0 ? 0 : null };
  return { valor, percentual: +((valor / Math.abs(anterior)) * 100).toFixed(1) };
}
