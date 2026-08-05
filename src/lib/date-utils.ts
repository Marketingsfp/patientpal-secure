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

/** Fuso horário da clínica. Usado para calcular fronteiras de dia civil
 *  (ex.: "o dia 24/07 começa e termina quando?") de forma independente do
 *  fuso do runtime que executa o código (navegador do usuário ou o Worker
 *  SSR do Cloudflare, que roda em UTC). */
export const TZ_CLINICA = "America/Sao_Paulo";

/**
 * Deslocamento (em minutos, a somar ao horário UTC) de `timeZone` no
 * instante `dateUTC`. Técnica padrão para converter "hora local de um fuso"
 * em instante UTC sem depender de bibliotecas externas — funciona mesmo em
 * fusos com horário de verão, embora o fuso da clínica (America/Sao_Paulo)
 * não tenha mais DST desde 2019.
 */
function offsetMinutos(dateUTC: Date, timeZone: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(dateUTC);
  const v: Record<string, number> = {};
  for (const p of partes) if (p.type !== "literal") v[p.type] = Number(p.value);
  const comoUTC = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return (comoUTC - dateUTC.getTime()) / 60000;
}

/**
 * Converte uma data+hora "local" de `timeZone` (ex.: 00:00 em São Paulo) para
 * o instante UTC correspondente, em ISO. Independe do fuso do runtime que
 * chama esta função — o resultado é o mesmo rodando no navegador (BRT) ou
 * no Worker SSR (UTC).
 */
export function zonedDateStringToUtcISO(
  dataYYYYMMDD: string,
  horaHHMMSS: string,
  timeZone: string = TZ_CLINICA,
): string {
  const [y, m, d] = dataYYYYMMDD.split("-").map(Number);
  const [hh, mm, ss] = horaHHMMSS.split(":").map(Number);
  const aproxUTC = Date.UTC(y, m - 1, d, hh, mm, ss ?? 0);
  const offset = offsetMinutos(new Date(aproxUTC), timeZone);
  return new Date(aproxUTC - offset * 60000).toISOString();
}

/**
 * Janela [início, fimExclusivo) de um dia civil da clínica (America/Sao_Paulo
 * por padrão), em ISO/UTC. Use com `.gte(inicio).lt(fimExclusivo)` nas
 * queries — nunca `new Date(\`${data}T00:00:00\`).toISOString()`, que
 * resolve no fuso do runtime (BRT no navegador, UTC no Worker SSR) e produz
 * janelas deslocadas em até 3 horas entre cliente e servidor.
 */
export function janelaDiaClinica(
  dataYYYYMMDD: string,
  timeZone: string = TZ_CLINICA,
): { inicio: string; fimExclusivo: string } {
  const inicio = zonedDateStringToUtcISO(dataYYYYMMDD, "00:00:00", timeZone);
  const [y, m, d] = dataYYYYMMDD.split("-").map(Number);
  const proxDia = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const fimExclusivo = zonedDateStringToUtcISO(proxDia, "00:00:00", timeZone);
  return { inicio, fimExclusivo };
}