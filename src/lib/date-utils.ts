/**
 * Utilitários de data — formatação em PT-BR.
 *
 * Regra crítica: datas "puras" (nascimento, vencimento, validade) vêm do banco
 * como `YYYY-MM-DD` (DATE) e NÃO devem sofrer shift de fuso. Sempre formate
 * com `timeZone: "UTC"` para evitar "31/12" virar "30/12" no fuso BR.
 *
 * Para timestamps com hora (created_at, inicio de agendamento), use os helpers
 * que respeitam o fuso local — esses representam um instante no tempo, não um dia.
 */

const PT_BR = "pt-BR";

/** Formata uma data PURA (YYYY-MM-DD ou Date) como dd/MM/yyyy SEM shift de fuso. */
export function formatDatePura(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(PT_BR, {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Calcula idade (em anos completos) a partir de uma data pura de nascimento. */
export function calcularIdade(nascimento: string | null | undefined): number | null {
  if (!nascimento) return null;
  const nasc = new Date(`${nascimento}T00:00:00Z`);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nasc.getUTCFullYear();
  const m = hoje.getUTCMonth() - nasc.getUTCMonth();
  if (m < 0 || (m === 0 && hoje.getUTCDate() < nasc.getUTCDate())) idade--;
  return idade;
}

/** Formata timestamp (ISO com hora) como dd/MM/yyyy HH:mm no fuso local. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(PT_BR, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Formata só a hora (HH:mm) de um timestamp. */
export function formatHora(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(PT_BR, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Hoje no fuso de São Paulo, formato YYYY-MM-DD (útil para input type="date"). */
export function hojeBR(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}