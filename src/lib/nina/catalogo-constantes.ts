/** Constantes do catálogo compartilhadas pelos esquemas (sem dependências). */
export const DIAS_SEMANA = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

export const RECORRENCIAS = ["Toda semana", "Quinzenal", "Mensal", "Data específica"] as const;
export type Recorrencia = (typeof RECORRENCIAS)[number];

/**
 * "23:59" no fim do horário é o jeito do cadastro de dizer "sem hora para
 * terminar" (homologação 14/10/2026): para o paciente vira "a partir de HH:MM".
 */
export function fimDoHorario(fim: unknown): string | null {
  const t = String(fim ?? "").trim();
  return !t || /^23:59(?::\d{2})?$/.test(t) ? null : t;
}

/** "07:00–23:59" (ou "07:00 às 23:59") num texto livre → "a partir de 07:00". */
export function semFimDoDia(texto: string): string {
  return texto.replace(
    /(?:\b(?:das|de|a partir das)\s+)?\b(\d{1,2}(?::\d{2}|h\d{0,2}))\s*(?:–|-|—|às|as|a|até|ate)\s*23(?::|h)59(?::\d{2})?\b/gi,
    "a partir de $1",
  );
}
