export const TIMEZONE_OPERACAO = "America/Sao_Paulo";

/**
 * Formata o timestamp real da mensagem/evento como DD/MM/AAAA HH:mm
 * no fuso de operação da clínica (America/Sao_Paulo).
 */
export function formatarDataHoraMensagem(valor?: string | number | Date | null): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE_OPERACAO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}
