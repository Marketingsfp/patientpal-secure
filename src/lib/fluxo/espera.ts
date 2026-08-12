/**
 * Tempo de espera do paciente no Fluxo.
 *
 * Regra: conta do check-in (última mudança de etapa registrada em
 * `fluxo_atualizado_em`) ou, na falta dele, do horário previsto (`inicio`).
 * Só classifica por faixas visuais — não altera nenhuma regra de negócio.
 */
export type FaixaEspera = "normal" | "atencao" | "critico";

export function minutosEspera(desde: string | null | undefined, agora: number = Date.now()): number {
  if (!desde) return 0;
  const t = new Date(desde).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 60000));
}

export function faixaEspera(min: number): FaixaEspera {
  if (min > 30) return "critico";
  if (min >= 15) return "atencao";
  return "normal";
}

export const CLASSE_ESPERA: Record<FaixaEspera, string> = {
  normal: "bg-emerald-500/15 text-emerald-700",
  atencao: "bg-amber-500/15 text-amber-700 font-semibold",
  critico: "bg-rose-500/15 text-rose-700 border border-rose-500/40 font-bold animate-pulse",
};

/** Média (arredondada) de espera de uma lista de instantes de referência. */
export function mediaEspera(refs: Array<string | null | undefined>, agora: number = Date.now()): number | null {
  const vals = refs.filter(Boolean).map((r) => minutosEspera(r, agora));
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}
