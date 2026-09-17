/**
 * Data e hora atuais no fuso da clínica, calculadas no servidor a cada
 * requisição. A Nina precisa disso para nunca perguntar ao paciente que dia é
 * hoje e para resolver sozinha "hoje", "amanhã", "semana que vem" etc.
 */

import { TZ_CLINICA } from "./date-utils";

export const FUSO_PADRAO = TZ_CLINICA;

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
  instante_utc: string;
  periodo_do_dia: "manha" | "tarde" | "noite";
  saudacao_do_periodo: "Bom dia" | "Boa tarde" | "Boa noite";
  datas_referencia: {
    hoje: string;
    amanha: string;
    depois_de_amanha: string;
    semana_atual: { inicio: string; fim: string };
    proxima_semana: { inicio: string; fim: string };
    proximos_dias: Array<{ data: string; dia_semana: number; nome_dia: string }>;
  };
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
    hourCycle: "h23",
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
  const diaSemana = mapa[nomeDia] ?? 0;
  const horaNumero = Number(hora.slice(0, 2));
  const periodo = horaNumero >= 5 && horaNumero < 12 ? "manha" : horaNumero >= 12 && horaNumero < 18 ? "tarde" : "noite";
  // Semana civil de segunda a domingo; não confundir com "daqui a 7 dias".
  const inicioSemana = somarDiasIso(partes, -((diaSemana + 6) % 7));
  const dias = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  return {
    iso: partes,
    extenso,
    hora,
    diaSemana,
    fuso,
    instante_utc: now.toISOString(),
    periodo_do_dia: periodo,
    saudacao_do_periodo: periodo === "manha" ? "Bom dia" : periodo === "tarde" ? "Boa tarde" : "Boa noite",
    datas_referencia: {
      hoje: partes,
      amanha: somarDiasIso(partes, 1),
      depois_de_amanha: somarDiasIso(partes, 2),
      semana_atual: { inicio: inicioSemana, fim: somarDiasIso(inicioSemana, 6) },
      proxima_semana: { inicio: somarDiasIso(inicioSemana, 7), fim: somarDiasIso(inicioSemana, 13) },
      proximos_dias: Array.from({ length: 14 }, (_, i) => ({
        data: somarDiasIso(partes, i),
        dia_semana: (diaSemana + i) % 7,
        nome_dia: dias[(diaSemana + i) % 7]!,
      })),
    },
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
