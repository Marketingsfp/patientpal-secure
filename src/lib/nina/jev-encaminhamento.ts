/**
 * Jev — Fase 2: encaminhar para a recepção. Puro (sem rede), testável.
 * Limites aprovados em 25/09/2026 (proposta do plano; ajustáveis depois).
 * Possível regra de negócio — validar com a equipe da clínica.
 */
import type { PerguntaJev, RespostaJev } from "./jev";
import { CONFIANCA_MINIMA_INTENCAO } from "./jev-intencao";

export const LIMITES_ENCAMINHAMENTO = { urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.8 } as const;

export function perguntasEncaminhamento(): Record<string, PerguntaJev> {
  return {
    urgencia: {
      type: "noul",
      instructions: "A `mensagem_atual` descreve um possível sinal de urgência clínica (dor forte, falta de ar, sangramento, desmaio, piora rápida, risco à vida)?",
      criteria: { true: "Há um sinal de urgência clínica.", false: "Não há sinal de urgência; dúvidas, pedidos de marcação ou sintomas leves não contam." },
    },
    pedido_atendente: {
      type: "noul",
      instructions: "Na `mensagem_atual`, o paciente pede explicitamente para falar com uma pessoa, atendente ou recepção?",
      criteria: { true: "Pede uma pessoa/atendente.", false: "Não pede; apenas conversa com a assistente." },
    },
    irritacao: {
      type: "noul",
      instructions: "Na `mensagem_atual`, o paciente demonstra irritação, reclamação ou insatisfação clara com o atendimento?",
      criteria: { true: "Está claramente irritado ou reclamando.", false: "Tom neutro ou educado; pressa ou dúvida não contam." },
    },
  };
}

export type Encaminhamento = { motivo: string; urgencia: "normal" | "alta" };

/** Dúvida = o Jev respondeu, mas sem confiança suficiente sobre o pedido. */
export function houveDuvida(intencao: RespostaJev | undefined): boolean {
  return typeof intencao?.confidence === "number" && intencao.confidence < CONFIANCA_MINIMA_INTENCAO;
}

export function decidirEncaminhamento(
  respostas: Record<string, RespostaJev> | null,
  duvidaAtual: boolean,
  duvidaAnterior: boolean,
): Encaminhamento | null {
  const p = (id: keyof typeof LIMITES_ENCAMINHAMENTO) => respostas?.[id]?.noul;
  const u = p("urgencia");
  if (typeof u === "number" && u >= LIMITES_ENCAMINHAMENTO.urgencia)
    return { motivo: "JEV_URGENCIA_CLINICA: possível urgência clínica", urgencia: "alta" };
  const a = p("pedido_atendente");
  if (typeof a === "number" && a >= LIMITES_ENCAMINHAMENTO.pedido_atendente)
    return { motivo: "JEV_PEDIDO_ATENDENTE: paciente pediu atendente", urgencia: "normal" };
  const i = p("irritacao");
  if (typeof i === "number" && i >= LIMITES_ENCAMINHAMENTO.irritacao)
    return { motivo: "JEV_IRRITACAO: paciente insatisfeito", urgencia: "normal" };
  if (duvidaAtual && duvidaAnterior)
    return { motivo: "JEV_DUVIDA_REPETIDA: pedido não compreendido em 2 mensagens seguidas", urgencia: "normal" };
  return null;
}
