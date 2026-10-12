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

export type SaudacaoPeriodo = "Bom dia" | "Boa tarde" | "Boa noite";

/** Hora (0-23) do instante informado no horário de Brasília. */
export function horaEmBrasilia(now: Date = new Date()): number {
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ_CLINICA,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hora.replace(/\D/g, "")) % 24;
}

/**
 * Saudação pelo horário real do servidor, lido no horário de Brasília:
 * "Bom dia" das 05:00 às 11:59, "Boa tarde" das 12:00 às 17:59 e
 * "Boa noite" das 18:00 às 04:59.
 *
 * O instante vem do relógio do servidor, mas a hora é sempre lida em
 * Brasília. O processo de produção (Cloudflare Workers) roda em UTC; ler
 * `getHours()` direto daria "Boa tarde" às 09:00 e "Boa noite" às 15:00.
 */
export function saudacaoPorHorarioServidor(now: Date = new Date()): SaudacaoPeriodo {
  const hora = horaEmBrasilia(now);
  return hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite";
}

/**
 * Datas da agenda permanecem no fuso clínico; a saudação acompanha o horário
 * real do servidor lido em Brasília, conforme a regra operacional do atendimento.
 */
export function agoraParaNina(fuso: string = FUSO_PADRAO, now: Date = new Date()): AgoraClinica {
  return {
    ...agoraNaClinica(fuso, now),
    saudacao_do_periodo: saudacaoPorHorarioServidor(now),
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
  const periodo =
    horaNumero >= 5 && horaNumero < 12
      ? "manha"
      : horaNumero >= 12 && horaNumero < 18
        ? "tarde"
        : "noite";
  // Semana civil de segunda a domingo; não confundir com "daqui a 7 dias".
  const inicioSemana = somarDiasIso(partes, -((diaSemana + 6) % 7));
  const dias = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  return {
    iso: partes,
    extenso,
    hora,
    diaSemana,
    fuso,
    instante_utc: now.toISOString(),
    periodo_do_dia: periodo,
    saudacao_do_periodo:
      periodo === "manha" ? "Bom dia" : periodo === "tarde" ? "Boa tarde" : "Boa noite",
    datas_referencia: {
      hoje: partes,
      amanha: somarDiasIso(partes, 1),
      depois_de_amanha: somarDiasIso(partes, 2),
      semana_atual: { inicio: inicioSemana, fim: somarDiasIso(inicioSemana, 6) },
      proxima_semana: {
        inicio: somarDiasIso(inicioSemana, 7),
        fim: somarDiasIso(inicioSemana, 13),
      },
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
