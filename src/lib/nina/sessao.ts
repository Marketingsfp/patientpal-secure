/**
 * SESSÃO DA NINA — memória conversacional com duração controlada (puro).
 *
 * Conceitos separados de propósito:
 *
 * - CONVERSA: aberta / resolvida / reaberta. Persistente.
 * - SESSÃO DA NINA: memória transitória do atendimento, com TTL deslizante
 *   (padrão 4 horas de inatividade). Expirar a sessão NÃO apaga mensagens,
 *   CRM, agendamentos, eventos, auditoria, resumos nem a Base de Conhecimentos.
 * - ESTADOS TRANSACIONAIS: etapas de operação em andamento (escolha de vaga,
 *   confirmação final, criação de agendamento). São encerrados assim que a
 *   conversa é resolvida — contexto pode sobreviver, operação pendente não.
 */

import type { EstadoFluxoNina, EtapaFluxoNina } from "./fluxo-estado-normalizar";

/** Valor inicial pedido pela clínica; configurável por ambiente. */
export const TTL_SESSAO_PADRAO_MINUTOS = 240;

/** Lê o TTL da sessão (minutos) do ambiente, com fallback seguro. */
export function ttlSessaoMinutos(env?: Record<string, string | undefined>): number {
  const bruto = (env ?? (typeof process !== "undefined" ? process.env : {}))?.[
    "NINA_SESSION_MEMORY_TTL_MINUTES"
  ];
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return TTL_SESSAO_PADRAO_MINUTOS;
  return Math.floor(n);
}

/**
 * Etapas que representam uma operação em andamento. Nenhuma delas pode
 * sobreviver ao encerramento da conversa: um "Oi" depois da resolução jamais
 * pode ser lido como confirmação de um agendamento antigo.
 */
export const ETAPAS_TRANSACIONAIS: EtapaFluxoNina[] = [
  "BOOKING_INTENT_CONFIRMED",
  "BOOKING_INTENT_PENDING",
  "IDENTIFYING_PATIENT",
  "CHOOSING_SLOT",
  "AWAITING_SLOT_CONFIRMATION",
  "AWAITING_PATIENT_DATA",
  "REVALIDATING_SLOT",
  "COLLECTING_PATIENT_DATA",
  "COLLECTING_BOOKING_PREFERENCES",
  "CHECKING_AVAILABILITY",
  "WAITING_SLOT_SELECTION",
  "WAITING_FINAL_CONFIRMATION",
  "CREATING_APPOINTMENT",
];

export function etapaTransacional(etapa: EtapaFluxoNina | string | null | undefined): boolean {
  return ETAPAS_TRANSACIONAIS.includes(etapa as EtapaFluxoNina);
}

/**
 * Encerra a operação pendente mantendo o contexto recente (paciente
 * identificado, especialidade/procedimento/profissional já conversados).
 */
export function encerrarEstadosTransacionais(estado: EstadoFluxoNina): EstadoFluxoNina {
  return {
    ...estado,
    patient: { ...estado.patient },
    appointment: {
      ...estado.appointment,
      date: null,
      time: null,
      slot_inicio: null,
      slot_fim: null,
      slot_confirmed_by_patient: false,
      intent_confirmed: false,
    },
    flow: { stage: "IDLE" },
  };
}

/** Última atividade relevante conhecida da sessão. */
export function ultimaAtividade(
  estado: EstadoFluxoNina,
  fallbackISO?: string | null,
): string | null {
  return estado.updated_at ?? fallbackISO ?? null;
}

/** TTL deslizante: expirou se a inatividade passou do limite. */
export function sessaoExpirada(
  ultimaAtividadeISO: string | null,
  agora: Date,
  ttlMinutos: number,
): boolean {
  if (!ultimaAtividadeISO) return false;
  const t = Date.parse(ultimaAtividadeISO);
  if (!Number.isFinite(t)) return false;
  return agora.getTime() - t > ttlMinutos * 60_000;
}

/**
 * Nova sessão após expiração. Só permanece o que é persistente por natureza
 * (identificação do paciente vinda do CRM). Nada de operação antiga.
 */
export function novaSessao(anterior: EstadoFluxoNina, agoraISO?: string): EstadoFluxoNina {
  const inicio = agoraISO ?? new Date().toISOString();
  return {
    session_id: novoSessionId(),
    session_started_at: inicio,
    patient: { ...anterior.patient },
    appointment: {
      doctor_id: null,
      doctor_name: null,
      specialty: null,
      procedure: null,
      date: null,
      time: null,
      slot_inicio: null,
      slot_fim: null,
      slot_confirmed_by_patient: false,
      intent_confirmed: false,
      appointment_id: null,
    },
    flow: { stage: "GREETING" },
    updated_at: null,
  };
}

/** Gera um identificador de sessão operacional novo. */
export function novoSessionId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Reabertura após resolução: o contexto recente pode ser aproveitado, mas a
 * sessão operacional é nova (novo id) e nenhuma operação antiga sobrevive.
 */
export function reabrirSessao(anterior: EstadoFluxoNina, agoraISO?: string): EstadoFluxoNina {
  const inicio = agoraISO ?? new Date().toISOString();
  const limpo = encerrarEstadosTransacionais(anterior);
  return {
    ...limpo,
    session_id: novoSessionId(),
    session_started_at: inicio,
    updated_at: inicio,
  };
}

/** Resumo curto da sessão anterior, para referência (sem estado transacional). */
export function resumoSessaoAnterior(anterior: EstadoFluxoNina): string | null {
  const a = anterior.appointment;
  const partes: string[] = [];
  if (a.specialty) partes.push(`especialidade ${a.specialty}`);
  if (a.procedure) partes.push(`procedimento ${a.procedure}`);
  if (a.doctor_name) partes.push(`profissional ${a.doctor_name}`);
  if (partes.length === 0) return null;
  const concluiu = Boolean(a.appointment_id);
  return `Sessão anterior: o paciente falou sobre ${partes.join(", ")}. ${
    concluiu ? "Houve agendamento concluído." : "Nenhum agendamento foi concluído."
  } Use só como referência: NÃO retome confirmações, vagas ou etapas antigas.`;
}

export type ResultadoSessao = {
  estado: EstadoFluxoNina;
  expirou: boolean;
  resumoAnterior: string | null;
  /** Reabertura recente (dentro do TTL) — contexto vale, operação não. */
  continuacao: boolean;
};

/**
 * Aplica o TTL deslizante ao estado carregado da conversa.
 * Dentro da janela: mantém contexto e garante que não sobrou operação pendente.
 * Fora da janela: abre nova sessão e guarda um resumo curto da anterior.
 */
export function aplicarTtlSessao(
  estado: EstadoFluxoNina,
  agora: Date,
  ttlMinutos: number,
  fallbackUltimaAtividade?: string | null,
): ResultadoSessao {
  const ultima = ultimaAtividade(estado, fallbackUltimaAtividade);
  if (sessaoExpirada(ultima, agora, ttlMinutos)) {
    return {
      estado: novaSessao(estado),
      expirou: true,
      resumoAnterior: resumoSessaoAnterior(estado),
      continuacao: false,
    };
  }
  return {
    estado,
    expirou: false,
    resumoAnterior: null,
    continuacao: Boolean(ultima),
  };
}

/** Bloco de prompt para a retomada (Parte 4 — saudação natural). */
export function blocoPromptSessao(r: ResultadoSessao): string {
  if (r.expirou) {
    return [
      "SESSÃO DA NINA: nova sessão (o atendimento anterior expirou por inatividade).",
      "- Pode usar a saudação/apresentação padrão normalmente.",
      "- NÃO retome etapas, vagas, confirmações ou intenções da sessão anterior.",
      r.resumoAnterior ? `- ${r.resumoAnterior}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (!r.continuacao) return "";
  return [
    "SESSÃO DA NINA: continuação recente do mesmo atendimento.",
    '- Não repita a apresentação completa. Cumprimente de forma natural (ex.: "Oi novamente! 😊 Como posso te ajudar?").',
    "- O contexto recente vale, mas qualquer operação pendente anterior (escolha de vaga, confirmação, criação de agendamento) já foi encerrada.",
    "- NÃO interprete um novo 'oi', 'sim' ou 'ok' como confirmação de agendamento antigo. Confirme tudo de novo antes de agir.",
  ].join("\n");
}
