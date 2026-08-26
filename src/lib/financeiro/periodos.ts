/**
 * Atalhos de período e cálculo do período de comparação.
 *
 * Tudo aqui trabalha com data pura no formato YYYY-MM-DD e nunca constrói um
 * `Date` no fuso do runtime: o mesmo código roda no navegador da clínica
 * (BRT) e no Worker do SSR (UTC), e `new Date("2026-08-26")` volta em dias
 * diferentes nos dois. O "hoje" vem de `hojeBR`, que já resolve no fuso da
 * clínica.
 */
import { hojeBR } from "@/lib/date-utils";

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

export const primeiroDiaDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
export const primeiroDiaDoAno = (iso: string) => `${iso.slice(0, 4)}-01-01`;
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
 * Atalhos da barra de período, na ordem pedida pela gestão. `make` recebe o
 * "hoje" para os testes não dependerem do relógio.
 */
export const PRESETS_PERIODO: Array<{
  label: string;
  hint: string;
  make: (hoje: string) => Periodo;
}> = [
  { label: "Hoje", hint: "Somente o dia de hoje", make: (h) => ({ de: h, ate: h }) },
  {
    label: "Ontem",
    hint: "Somente o dia de ontem",
    make: (h) => ({ de: addDias(h, -1), ate: addDias(h, -1) }),
  },
  {
    label: "7d",
    hint: "Últimos 7 dias, incluindo hoje",
    make: (h) => ({ de: addDias(h, -6), ate: h }),
  },
  {
    label: "15d",
    hint: "Últimos 15 dias, incluindo hoje",
    make: (h) => ({ de: addDias(h, -14), ate: h }),
  },
  {
    label: "30d",
    hint: "Últimos 30 dias, incluindo hoje",
    make: (h) => ({ de: addDias(h, -29), ate: h }),
  },
  {
    label: "Este mês",
    hint: "Do dia 1º do mês até hoje",
    make: (h) => ({ de: primeiroDiaDoMes(h), ate: h }),
  },
  {
    label: "Mês anterior",
    hint: "Do 1º ao último dia do mês passado",
    make: (h) => {
      const ultimoDoMesPassado = addDias(primeiroDiaDoMes(h), -1);
      return { de: primeiroDiaDoMes(ultimoDoMesPassado), ate: ultimoDoMesPassado };
    },
  },
  {
    label: "Este ano",
    hint: "De 1º de janeiro até hoje",
    make: (h) => ({ de: primeiroDiaDoAno(h), ate: h }),
  },
];

/** Nome do atalho que corresponde ao período atual, se algum corresponder. */
export function presetAtivo(p: Periodo, hoje = hojeBR()): string | null {
  for (const preset of PRESETS_PERIODO) {
    const alvo = preset.make(hoje);
    if (alvo.de === p.de && alvo.ate === p.ate) return preset.label;
  }
  return null;
}

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
