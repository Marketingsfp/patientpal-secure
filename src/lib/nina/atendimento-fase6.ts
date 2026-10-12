/**
 * FASE 6 do novo fluxo de atendimento da Nina — máquina de estados explícita
 * e regras de handoff.
 *
 * A máquina NÃO transforma a Nina em script: ela só decide QUAL etapa está
 * ativa e quais regras/dados são obrigatórios ali. A linguagem continua
 * generativa. O objetivo é impedir salto de etapa crítica (pedir dados sem
 * intenção confirmada, agendar sem confirmação final, afirmar sucesso sem
 * registro real).
 *
 * Módulo PURO: deriva etapa a partir do estado + mensagem.
 */
import type { EstadoFluxoNina, EtapaFluxoNina } from "./fluxo-estado.server";
import { dadosFaltantes } from "./atendimento-fase3";
import { faltaParaConsultarAgenda } from "./atendimento-fase4";
import { reservaDaSessaoAtual } from "./agendamento-sessao";
import { atendimentoDefinido } from "./cadastro-paciente";
import { confirmacaoDaEscolha } from "./agendamento-escolha";

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PADROES_PEDIDO_HUMANO: RegExp[] = [
  /\b(atendente|humano|pessoa de verdade|uma pessoa|recepcao|recepcionista|secretaria|funcionari[oa])\b/,
  /\b(falar|conversar|quero falar) com (alguem|voces|a equipe|um atendente|uma atendente)\b/,
  /\bnao quero (falar com )?(rob(o|otizado)|ia|inteligencia artificial|bot)\b/,
];

export function pediuAtendenteHumano(mensagem: string): boolean {
  const t = normalizar(mensagem);
  return PADROES_PEDIDO_HUMANO.some((r) => r.test(t));
}

export type ContextoFase6 = {
  mensagem: string;
  estado: EstadoFluxoNina;
  /** Primeira mensagem da conversa (sem histórico anterior). */
  primeiraMensagem: boolean;
  /** Intenções detectadas na Fase 1. */
  intencoes: readonly string[];
  /** Falha recente de criação de agendamento / tool sem recuperação. */
  falhaSemRecuperacao?: boolean;
};

/**
 * Deriva a etapa atual. Ordem de precedência: handoff > agendamento criado >
 * etapas do funil de agendamento > informação > identificação de intenção.
 */
export function derivarEtapa(ctx: ContextoFase6): EtapaFluxoNina {
  const { estado } = ctx;
  const a = estado.appointment;

  if (
    pediuAtendenteHumano(ctx.mensagem) ||
    ctx.falhaSemRecuperacao ||
    estado.flow.stage === "HANDOFF"
  )
    return "HANDOFF";
  if (reservaDaSessaoAtual(estado)) return "APPOINTMENT_CONFIRMED";
  if (confirmacaoDaEscolha(estado)) {
    if (!estado.patient.identified || !estado.patient.validated || !estado.patient.id)
      return "COLLECTING_PATIENT_DATA";
    if (!a.confirmation?.aceita) return "WAITING_FINAL_CONFIRMATION";
    return "CREATING_APPOINTMENT";
  }

  if (a.intent_confirmed) {
    if (atendimentoDefinido(estado)) {
      if (!a.slot_confirmed_by_patient) return "WAITING_FINAL_CONFIRMATION";
      if (dadosFaltantes(estado).length > 0) return "COLLECTING_PATIENT_DATA";
      return "CREATING_APPOINTMENT";
    }
    if (faltaParaConsultarAgenda(estado).length > 0) return "COLLECTING_BOOKING_PREFERENCES";
    return "CHECKING_AVAILABILITY";
  }

  if (a.slot_inicio || (a.date && a.time) || a.slot_options?.vagas.length)
    return "WAITING_SLOT_SELECTION";
  if (ctx.intencoes.includes("agendamento")) return "BOOKING_INTENT_PENDING";
  if (ctx.primeiraMensagem) return "GREETING";
  if (ctx.intencoes.length > 0) return "INFORMATION_RESPONSE";
  return "INTENT_IDENTIFICATION";
}
