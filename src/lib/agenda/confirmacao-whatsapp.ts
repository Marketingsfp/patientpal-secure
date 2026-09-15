// Regras puras da confirmação automática de consultas pelo WhatsApp.
//
// Fica separado do servidor para ser testado sem banco: é aqui que mora a
// decisão de "o que o paciente quis dizer" e "para qual número dá para
// mandar" — duas coisas que, erradas, alteram a agenda de alguém ou mandam a
// mensagem para a pessoa errada.

import { dataClinicaDe, TZ_CLINICA } from "@/lib/date-utils";

export type EtapaConfirmacao = "48h" | "24h";
export type AcaoResposta = "confirmar" | "cancelar";

/** Dias de calendário antes da consulta em que cada etapa sai. */
export const DIAS_ANTES: Record<EtapaConfirmacao, number> = { "48h": 2, "24h": 1 };

export const TEMPLATE_CONFIRMACAO = {
  corpo:
    "Olá, {{1}}! Você possui consulta agendada para {{2}} às {{3}}.\n\n" +
    "Responda:\n1 - Confirmar presença\n2 - Não poderei comparecer",
  exemplo: ["Maria", "quarta-feira, 16/09", "09:30"],
  botaoConfirmar: "Confirmar presença",
  botaoCancelar: "Não poderei comparecer",
} as const;

const PREFIXO_PAYLOAD = "cc";

export function payloadBotao(confirmacaoId: string, acao: AcaoResposta): string {
  return `${PREFIXO_PAYLOAD}:${confirmacaoId}:${acao === "confirmar" ? "1" : "2"}`;
}

export function lerPayloadBotao(
  payload: string | null | undefined,
): { confirmacaoId: string; acao: AcaoResposta } | null {
  const m = /^cc:([0-9a-f-]{36}):([12])$/i.exec(String(payload ?? "").trim());
  if (!m) return null;
  return { confirmacaoId: m[1]!.toLowerCase(), acao: m[2] === "1" ? "confirmar" : "cancelar" };
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const CONFIRMAR = new Set([
  "1",
  "sim",
  "s",
  "ok",
  "confirmo",
  "confirmado",
  "confirmada",
  "confirmar",
  "confirmar presenca",
  "1 confirmar presenca",
  "sim confirmo",
  "confirmo presenca",
  "vou",
  "sim vou",
  "estarei",
  "estarei la",
  "presenca confirmada",
  "👍",
]);

const CANCELAR = new Set([
  "2",
  "nao",
  "n",
  "cancelar",
  "cancela",
  "pode cancelar",
  "nao vou",
  "nao poderei",
  "nao poderei comparecer",
  "2 nao poderei comparecer",
  "nao posso",
  "nao vou poder",
  "nao vou conseguir",
]);

/**
 * Interpreta uma resposta digitada. Só reconhece mensagens CURTAS e
 * inequívocas; qualquer frase com mais conteúdo ("sim, mas dá para mudar o
 * horário?") devolve `null` e segue para o atendimento normal.
 */
export function interpretarResposta(texto: string | null | undefined): AcaoResposta | null {
  const bruto = String(texto ?? "").trim();
  if (!bruto || bruto.length > 40) return null;
  if (bruto === "👍" || bruto === "👍🏻" || bruto === "👍🏽") return "confirmar";
  const limpo = semAcento(bruto.toLowerCase())
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (CONFIRMAR.has(limpo)) return "confirmar";
  if (CANCELAR.has(limpo)) return "cancelar";
  return null;
}

/**
 * Número para envio pela API oficial: 55 + DDD + celular de 9 dígitos.
 * Número sem DDD NÃO recebe DDD presumido — mandar para a pessoa errada é pior
 * que não mandar. Fixo também fica de fora (não tem WhatsApp na maioria).
 */
export function celularParaEnvio(telefone: string | null | undefined): string | null {
  let d = String(telefone ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13) d = d.slice(2);
  if (d.startsWith("0") && d.length === 12) d = d.slice(1);
  if (!/^[1-9][1-9]9\d{8}$/.test(d)) return null;
  return `55${d}`;
}

/**
 * Chave de casamento do telefone: DDD + últimos 8 dígitos. A Meta às vezes
 * entrega o remetente brasileiro sem o nono dígito (55 21 8xxx-xxxx), então a
 * comparação ignora esse dígito.
 */
export function chaveTelefone(numero: string | null | undefined): string | null {
  let d = String(numero ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return `${d.slice(0, 2)}${d.slice(-8)}`;
}

/** Primeiro nome em formato de gente ("MARIA DA SILVA" → "Maria"). */
export function primeiroNome(nome: string | null | undefined): string {
  const primeiro =
    String(nome ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";
  if (!primeiro) return "paciente";
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

/** "quarta-feira, 16/09" no fuso da clínica. */
export function dataPorExtenso(inicio: string | Date): string {
  const d = typeof inicio === "string" ? new Date(inicio) : inicio;
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: TZ_CLINICA }).format(
    d,
  );
  const dia = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TZ_CLINICA,
  }).format(d);
  return `${semana}, ${dia}`;
}

export function horaClinica(inicio: string | Date): string {
  const d = typeof inicio === "string" ? new Date(inicio) : inicio;
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ_CLINICA,
  }).format(d);
}

/** Parâmetros {{1}}, {{2}}, {{3}} do template. */
export function parametrosTemplate(dados: {
  pacienteNome: string;
  inicio: string;
  ordemChegada: boolean;
}): [string, string, string] {
  const hora = horaClinica(dados.inicio);
  return [
    primeiroNome(dados.pacienteNome),
    dataPorExtenso(dados.inicio),
    dados.ordemChegada ? `${hora} (atendimento por ordem de chegada)` : hora,
  ];
}

/** Soma dias a uma data civil YYYY-MM-DD. */
export function somarDias(dataYYYYMMDD: string, dias: number): string {
  const [y, m, d] = dataYYYYMMDD.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

/** "HH:MM" atual no fuso da clínica. */
export function horaAgoraClinica(agora: Date = new Date()): string {
  return horaClinica(agora);
}

export function dentroDaJanelaDeEnvio(
  horaInicio: string,
  horaFim: string,
  agora: Date = new Date(),
): boolean {
  const h = horaAgoraClinica(agora);
  return h >= horaInicio.slice(0, 5) && h < horaFim.slice(0, 5);
}

/** Etapa cabível para uma consulta hoje, ou null. */
export function etapaParaConsulta(
  inicio: string,
  hojeClinica: string,
  etapasAtivas: readonly string[],
): EtapaConfirmacao | null {
  const diaConsulta = dataClinicaDe(inicio);
  if (!diaConsulta) return null;
  for (const etapa of ["48h", "24h"] as const) {
    if (!etapasAtivas.includes(etapa)) continue;
    if (somarDias(hojeClinica, DIAS_ANTES[etapa]) === diaConsulta) return etapa;
  }
  return null;
}

export function textoFechamento(
  resultado: "confirmado" | "cancelado" | "ja_cancelado" | "sem_efeito",
  dados: { inicio: string },
): string {
  const quando = `${dataPorExtenso(dados.inicio)} às ${horaClinica(dados.inicio)}`;
  switch (resultado) {
    case "confirmado":
      return `Obrigado! Sua presença está confirmada para ${quando}. Até lá!`;
    case "cancelado":
      return `Tudo bem, sua consulta de ${quando} foi cancelada. Se quiser remarcar, é só escrever aqui.`;
    case "ja_cancelado":
      return "Este agendamento já estava cancelado. Se quiser remarcar, é só escrever aqui.";
    case "sem_efeito":
      return "Recebemos sua resposta. Como este agendamento teve alteração, nossa equipe vai verificar. Se precisar, é só escrever aqui.";
  }
}

/** Frase para a recepção ver na Agenda. */
export function descricaoParaEquipe(c: {
  status: string;
  resposta_acao: string | null;
  observacao: string | null;
}): { texto: string; tom: "ok" | "alerta" | "neutro" } {
  switch (c.status) {
    case "confirmado":
      return { texto: "Paciente confirmou pelo WhatsApp", tom: "ok" };
    case "cancelado":
      return { texto: "Paciente cancelou pelo WhatsApp", tom: "alerta" };
    case "sem_efeito":
      return {
        texto:
          c.resposta_acao === "cancelar"
            ? `Paciente respondeu que NÃO vem — verificar${c.observacao ? ` (${c.observacao})` : ""}`
            : `Paciente respondeu que vem${c.observacao ? ` (${c.observacao})` : ""}`,
        tom: c.resposta_acao === "cancelar" ? "alerta" : "neutro",
      };
    case "enviado":
    case "processando":
      return { texto: "Lembrete automático enviado, sem resposta", tom: "neutro" };
    case "sem_telefone":
      return { texto: "Lembrete automático não enviado: sem celular com DDD", tom: "alerta" };
    case "falha":
      return {
        texto: `Lembrete automático falhou${c.observacao ? `: ${c.observacao}` : ""}`,
        tom: "alerta",
      };
    default:
      return { texto: "Lembrete automático", tom: "neutro" };
  }
}
