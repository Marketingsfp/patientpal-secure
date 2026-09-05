/**
 * Tempo de espera do paciente em uma conversa do atendimento.
 *
 * Regra: conta a partir da PRIMEIRA mensagem do paciente que ainda não foi
 * respondida (nem pela Nina, nem por um atendente). O cálculo do instante
 * inicial vem do banco (RPC `atend_espera_por_conversa`); aqui só ficam as
 * regras de faixa, formatação e acessibilidade — centralizadas para poderem
 * ser configuradas depois sem mexer em componente.
 */

export type FaixaEsperaAtd = "normal" | "atencao" | "critico";

/** Limites (em minutos) das faixas visuais. Centralizados de propósito. */
export const LIMITES_ESPERA_ATD = {
  atencao: 5,
  critico: 10,
} as const;

export function faixaEsperaAtd(minutos: number): FaixaEsperaAtd {
  if (minutos >= LIMITES_ESPERA_ATD.critico) return "critico";
  if (minutos >= LIMITES_ESPERA_ATD.atencao) return "atencao";
  return "normal";
}

/** Minutos inteiros decorridos desde `desde` (ISO). Nunca negativo. */
export function minutosDesde(desde: string | null | undefined, agora: number = Date.now()): number {
  if (!desde) return 0;
  const t = new Date(desde).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 60000));
}

/** `2 min` · `49 min` · `1h 05min` · `1d 2h`. */
export function formatarEspera(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, "0")}min`;
  }
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return `${d}d ${h}h`;
}

/** Texto lido por leitores de tela. */
export function rotuloEspera(minutos: number): string {
  return `Paciente aguardando resposta há ${formatarEspera(minutos)}`;
}

/**
 * Classes por faixa usando tokens do design system (funcionam em claro e
 * escuro). Nunca cor fixa de um tema só.
 */
export const CLASSE_ESPERA_ATD: Record<FaixaEsperaAtd, string> = {
  normal: "bg-primary/10 text-primary border-primary/20",
  atencao: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  critico:
    "bg-destructive/15 text-destructive dark:text-red-300 border-destructive/40 font-semibold",
};
