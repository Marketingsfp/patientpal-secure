/**
 * Data e hora atuais no fuso da clínica, calculadas no servidor a cada
 * requisição. A Nina precisa disso para nunca perguntar ao paciente que dia é
 * hoje e para resolver sozinha "hoje", "amanhã", "semana que vem" etc.
 */

export const FUSO_PADRAO = "America/Sao_Paulo";

export interface AgoraClinica {
  /** "2026-08-27" */
  iso: string;
  /** "quinta-feira, 27 de agosto de 2026" */
  extenso: string;
  /** "10:48" */
  hora: string;
  /** 0 = domingo */
  diaSemana: number;
  fuso: string;
}

export function agoraNaClinica(fuso: string = FUSO_PADRAO, now: Date = new Date()): AgoraClinica {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const extenso = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const nomeDia = new Intl.DateTimeFormat("en-US", { timeZone: fuso, weekday: "short" }).format(
    now,
  );
  const mapa: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    iso: partes,
    extenso,
    hora,
    diaSemana: mapa[nomeDia] ?? 0,
    fuso,
  };
}

/** Soma dias a uma data ISO (YYYY-MM-DD) sem depender de fuso. */
export function somarDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/** Bloco de texto injetado no system prompt com data/hora e regras temporais. */
export function blocoDataHoraAgora(fuso: string = FUSO_PADRAO, now: Date = new Date()): string {
  const a = agoraNaClinica(fuso, now);
  return `DATA E HORA ATUAIS (calculadas pelo sistema — são a verdade):
Agora é ${a.extenso}, ${a.hora} (${a.fuso}). Data de hoje em ISO: ${a.iso}.

REGRAS DE TEMPO:
- NUNCA pergunte ao paciente que dia é hoje, que horas são ou que dia da semana é. Você já sabe.
- Resolva sozinha "hoje", "amanhã", "depois de amanhã", "essa semana", "semana que vem", "segunda que vem", "daqui a X dias" a partir da data acima.
- Ao confirmar data, diga a absoluta junto da relativa: "amanhã, sexta-feira, 28/08".
- Se o horário pedido para hoje já passou, avise que já passou e ofereça os próximos disponíveis.`;
}
