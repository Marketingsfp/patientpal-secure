/**
 * Bloco "AGORA" injetado em TODO prompt da Nina (chat interno, voz e
 * WhatsApp).
 *
 * POR QUE EXISTE: sem data/hora no prompt, o modelo não tem noção de tempo e
 * chegou a perguntar ao paciente "qual o dia da semana de hoje?" — inaceitável
 * num atendimento real. O cálculo é sempre feito no servidor, no momento da
 * requisição, no fuso da clínica — nunca constante fixa, nunca relógio do
 * navegador.
 */

import { TZ_CLINICA } from "@/lib/date-utils";

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Data/hora atuais no fuso informado, em partes prontas para o prompt. */
export function agoraNaClinica(timeZone: string = TZ_CLINICA, agora: Date = new Date()) {
  const extenso = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(agora);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(agora);
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const diaSemana = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long" }).format(agora);
  return { extenso, hora, iso, diaSemana, timeZone };
}

/**
 * Texto a colar no system prompt: data/hora atuais + regras de uso do tempo.
 * `timeZone` deve vir da configuração da clínica quando existir; o padrão é
 * America/Sao_Paulo.
 */
export function blocoDataHoraAgora(timeZone: string = TZ_CLINICA, agora: Date = new Date()) {
  const a = agoraNaClinica(timeZone, agora);
  return `=== DATA E HORA ATUAIS (calculadas no servidor) ===
Agora é ${a.extenso}, ${a.hora} (${a.timeZone}). Data de hoje em ISO: ${a.iso}.
Dia da semana de hoje: ${capitalizar(a.diaSemana)}.

REGRAS DE TEMPO (obrigatórias):
- Você JÁ SABE a data, a hora e o dia da semana. NUNCA pergunte ao paciente ou ao colaborador que dia é hoje, que horas são ou qual o dia da semana.
- Resolva sozinha expressões relativas ("hoje", "amanhã", "depois de amanhã", "essa semana", "semana que vem", "segunda que vem", "daqui a X dias") sempre a partir da data acima.
- Ao consultar agenda/disponibilidade, converta a expressão para a DATA ISO (AAAA-MM-DD) antes de buscar — nunca envie texto solto como "hoje" para a consulta.
- Ao confirmar ou sugerir um agendamento, diga sempre a data absoluta junto da relativa: "amanhã, sexta-feira, 28/08".
- Se pedirem um horário de hoje que já passou (anterior a ${a.hora}), avise que o horário já passou e ofereça os próximos disponíveis, em vez de aceitar.
=== FIM DATA E HORA ===`;
}
