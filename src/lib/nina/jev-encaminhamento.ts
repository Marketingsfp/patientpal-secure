/**
 * Jev — Fase 2: encaminhar para a recepção. Puro (sem rede), testável.
 * Limites aprovados em 25/09/2026 (proposta do plano; ajustáveis depois).
 * Possível regra de negócio — validar com a equipe da clínica.
 */
import type { PerguntaJev, RespostaJev } from "./jev";

export const LIMITES_ENCAMINHAMENTO = { urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.8 } as const;

/**
 * Abaixo desta probabilidade de "dá para entender", a mensagem conta como falha
 * de entendimento. É a pergunta própria de entendimento (25/09/2026), e não a
 * confiança da escolha de intenção, que fica baixa sempre que as categorias se
 * sobrepõem, mesmo quando a mensagem é clara.
 */
export const LIMITE_ENTENDIMENTO = 0.5;

export function perguntasEncaminhamento(): Record<string, PerguntaJev> {
  return {
    entendimento: {
      type: "noul",
      instructions:
        "Considerando `mensagens_anteriores` e `contexto_atendimento` (etapa atual e opções já oferecidas), dá para entender com segurança o que o paciente quer dizer na `mensagem_atual`, seja um pedido novo, seja a resposta ou a continuação da última pergunta ou oferta da atendente?",
      criteria: {
        true: "Dá para entender: é um pedido compreensível ou responde/continua a conversa (inclusive respostas curtas como uma especialidade, um nome de médico, um dia ou um sim).",
        false: "Não dá para entender o que o paciente quer: a mensagem é incompreensível ou não tem relação com a conversa.",
      },
    },
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

/** O Jev respondeu que NÃO dá para entender a mensagem (sem resposta não é falha). */
export function naoEntendeu(entendimento: RespostaJev | undefined): boolean {
  return typeof entendimento?.noul === "number" && entendimento.noul < LIMITE_ENTENDIMENTO;
}

/**
 * Falhas reais de entendimento, contadas entre turnos (decisão de 25/09/2026,
 * sessão 470): uma falha isolada não encaminha; escolher uma opção já
 * oferecida não é falha; e a contagem zera quando o atendimento avança.
 */
export type ContagemDuvida = {
  /** Mensagens seguidas sem entendimento e sem avanço do atendimento. */
  falhas: number;
  /** Marco do andamento no turno (ver `marcoAtendimento`). */
  marco: string;
  /**
   * Probabilidades de "dá para entender" das falhas contadas, da mais antiga
   * para a mais recente. (Nome mantido pelos registros já gravados.)
   */
  confiancas: number[];
};

/** Igual à CONV-04: até duas perguntas de esclarecimento; encaminha se a resposta à segunda ainda não resolver. */
export const FALHAS_PARA_ENCAMINHAR = 3;

export function contarDuvida(a: {
  /** Resposta à pergunta `entendimento` (Fase 2). */
  entendimento: RespostaJev | undefined;
  /** A mensagem escolhe uma das opções já oferecidas. */
  selecaoValida: boolean;
  marco: string;
  anterior: ContagemDuvida | null;
}): ContagemDuvida {
  if (!naoEntendeu(a.entendimento) || a.selecaoValida) return { falhas: 0, marco: a.marco, confiancas: [] };
  const confianca = a.entendimento!.noul!;
  const continua = a.anterior !== null && a.anterior.falhas > 0 && a.anterior.marco === a.marco;
  return {
    falhas: continua ? a.anterior!.falhas + 1 : 1,
    marco: a.marco,
    confiancas: [...(continua ? a.anterior!.confiancas : []), confianca].slice(-3),
  };
}

const numero = (n: number) => n.toFixed(2).replace(".", ",");

export function decidirEncaminhamento(
  respostas: Record<string, RespostaJev> | null,
  contagem: ContagemDuvida | null,
): Encaminhamento | null {
  const p = (id: keyof typeof LIMITES_ENCAMINHAMENTO) => respostas?.[id]?.noul;
  const u = p("urgencia");
  if (typeof u === "number" && u >= LIMITES_ENCAMINHAMENTO.urgencia)
    return { motivo: `JEV_URGENCIA_CLINICA: possível urgência clínica (pontuação ${numero(u)})`, urgencia: "alta" };
  const a = p("pedido_atendente");
  if (typeof a === "number" && a >= LIMITES_ENCAMINHAMENTO.pedido_atendente)
    return { motivo: `JEV_PEDIDO_ATENDENTE: paciente pediu atendente (pontuação ${numero(a)})`, urgencia: "normal" };
  const i = p("irritacao");
  if (typeof i === "number" && i >= LIMITES_ENCAMINHAMENTO.irritacao)
    return { motivo: `JEV_IRRITACAO: paciente insatisfeito (pontuação ${numero(i)})`, urgencia: "normal" };
  if (contagem && contagem.falhas >= FALHAS_PARA_ENCAMINHAR)
    return {
      motivo: `JEV_DUVIDA_REPETIDA: pedido não compreendido em ${contagem.falhas} mensagens seguidas, sem avanço do atendimento (entendimento ${contagem.confiancas.map(numero).join(" e ")})`,
      urgencia: "normal",
    };
  return null;
}

/** Texto legível do motivo, sem o código técnico (ex.: para o resumo da equipe). */
export function motivoLegivel(motivo: string): string {
  return motivo.replace(/^JEV_[A-Z_]+:\s*/, "");
}
