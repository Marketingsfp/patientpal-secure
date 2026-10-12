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
