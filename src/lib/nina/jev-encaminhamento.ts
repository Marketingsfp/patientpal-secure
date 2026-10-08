/**
 * Jev — Fase 2: encaminhar para a recepção. Puro (sem rede), testável.
 * Duas falhas de entendimento encaminham (regra confirmada em 05/10/2026).
 */
import type { PerguntaJev, RespostaJev } from "./jev";
import { ehSaudacaoPura } from "./confidence/turno-tipo";
import type { ProvaEsclarecimento } from "./jev-esclarecimento-entregue";

export const LIMITES_ENCAMINHAMENTO = { urgencia: 0.5, pedido_atendente: 0.7, irritacao: 0.8 } as const;

/**
 * Abaixo desta probabilidade de "dá para entender", a mensagem conta como falha
 * de entendimento. É a pergunta própria de entendimento (25/09/2026), e não a
 * confiança da escolha de intenção, que fica baixa sempre que as categorias se
 * sobrepõem, mesmo quando a mensagem é clara.
 */
export const LIMITE_ENTENDIMENTO = 0.5;

export const REGRA_DUAS_FALHAS_ENTENDIMENTO = "ENTENDIMENTO-02 — Na primeira mensagem do paciente que não conseguir compreender, peça esclarecimento objetivo. Se não compreender a nova resposta do paciente, essa é a segunda falha: encaminhe para atendimento humano pela ferramenta disponível, com o motivo e a dúvida restante, sem pedir uma terceira tentativa. Saudações não são falhas. Só conte a segunda falha quando houver prova de que uma pergunta de esclarecimento foi enviada entre as duas entradas; abertura como Como posso ajudar não é esclarecimento. Conte mensagens do paciente, nunca chamadas ao modelo, pesquisas de ferramentas ou reprocessamentos da mesma entrada. Entendimento confirmado ou avanço real reinicia a sequência. Falha técnica, dado ausente na fonte e perguntas necessárias de cadastro, data, horário ou confirmação não são falhas de entendimento. Preserve respostas confirmadas às perguntas independentes. Esta regra prevalece sobre instruções antigas de três mensagens ou duas perguntas de esclarecimento. Na homologação use somente o encaminhamento simulado; transferência real só pode ser anunciada após confirmação do sistema.";

export function perguntasEncaminhamento(): Record<string, PerguntaJev> {
  return {
    entendimento: {
      type: "noul",
      instructions:
        "Considerando `mensagens_anteriores` e `contexto_atendimento` (etapa atual e opções já oferecidas), dá para entender com segurança o que o paciente quer dizer na `mensagem_atual`, seja um pedido novo, seja a resposta ou a continuação da última pergunta ou oferta da atendente?",
      criteria: {
        true: "Dá para entender: é um pedido compreensível ou responde/continua a conversa (inclusive saudações como boa noite e respostas curtas como uma especialidade, um nome de médico, um dia ou um sim).",
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
      instructions: "Na `mensagem_atual`, o paciente pede explicitamente para falar com uma atendente, a recepção ou uma pessoa da equipe, em vez da assistente? Pedir um médico, uma médica ou outro profissional de saúde para ser atendido (\"com a dra Andrea\", \"com o Dr. Jorge\", \"quero o ortopedista\") é escolha de profissional, NÃO pedido de atendente.",
      criteria: {
        true: "Pede atendente, recepção ou uma pessoa da equipe: 'quero falar com uma atendente', 'me passa pra recepção', 'quero falar com alguém', 'tem alguém aí?'.",
        false: "Não pede: conversa com a assistente ou escolhe um profissional de saúde ('qria cm a dra andrea', 'com o Dr. Jorge', 'o primeiro com o dr alex').",
      },
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
  /** IDs da entrada já avaliada, para reprocessamento não contar outra falha. */
  mensagensEntrada?: string[];
  esclarecimento?: ProvaEsclarecimento;
};

/** Primeira mensagem incompreendida: esclarecer. Segunda: encaminhar. */
export const FALHAS_PARA_ENCAMINHAR = 2;

export function contarDuvida(a: {
  /** Resposta à pergunta `entendimento` (Fase 2). */
  entendimento: RespostaJev | undefined;
  /** A mensagem escolhe uma das opções já oferecidas. */
  selecaoValida: boolean;
  marco: string;
  anterior: ContagemDuvida | null;
  mensagensEntrada?: readonly string[];
  mensagem?: string;
  esclarecimento?: ProvaEsclarecimento | null;
}): ContagemDuvida {
  const ids = [...new Set(a.mensagensEntrada ?? [])];
  const entrada = ids.length ? { mensagensEntrada: ids } : {};
  if (ehSaudacaoPura(a.mensagem ?? "") || a.selecaoValida || (typeof a.entendimento?.noul === "number" && !naoEntendeu(a.entendimento)))
    return { falhas: 0, marco: a.marco, confiancas: [], ...entrada };
  if (a.anterior?.marco === a.marco && (typeof a.entendimento?.noul !== "number" ||
    (ids.length > 0 && ids.some(id => a.anterior!.mensagensEntrada?.includes(id))))) {
    const { esclarecimento: _anterior, ...contagem } = a.anterior;
    return contagem;
  }
  if (!naoEntendeu(a.entendimento)) return { falhas: 0, marco: a.marco, confiancas: [], ...entrada };
  const confianca = a.entendimento!.noul!;
  const continua = a.anterior !== null && a.anterior.falhas > 0 && a.anterior.marco === a.marco &&
    !!a.esclarecimento && a.anterior.mensagensEntrada?.includes(a.esclarecimento.entradaAnteriorId) && ids.length > 0;
  return {
    falhas: continua ? FALHAS_PARA_ENCAMINHAR : 1,
    marco: a.marco,
    confiancas: [...(continua ? a.anterior!.confiancas : []), confianca].slice(-FALHAS_PARA_ENCAMINHAR),
    ...entrada,
    ...(continua ? { esclarecimento: a.esclarecimento! } : {}),
  };
}

const numero = (n: number) => n.toFixed(2).replace(".", ",");

const CITA_PROFISSIONAL = /\b(?:dr|dra|doutor|doutora|dotor|dotora|m[eé]dic[oa])\b/i;
const CITA_ATENDIMENTO = /\b(?:atendente|recep[cç][aã]o|recepcionista|pessoa|algu[eé]m|humano|secret[aá]ri[oa])\b/i;

/** "qria cm a dra andrea" escolhe a médica; não é pedido de atendente (07/10/2026). */
export function escolheProfissionalSemPedirAtendente(mensagem: string | undefined): boolean {
  return Boolean(mensagem && CITA_PROFISSIONAL.test(mensagem) && !CITA_ATENDIMENTO.test(mensagem));
}

export function decidirEncaminhamento(
  respostas: Record<string, RespostaJev> | null,
  contagem: ContagemDuvida | null,
  limites: { urgencia: number; pedido_atendente: number; irritacao: number } = LIMITES_ENCAMINHAMENTO,
  mensagem?: string,
): Encaminhamento | null {
  const p = (id: keyof typeof LIMITES_ENCAMINHAMENTO) => respostas?.[id]?.noul;
  const u = p("urgencia");
  if (typeof u === "number" && u >= limites.urgencia)
    return { motivo: `JEV_URGENCIA_CLINICA: possível urgência clínica (pontuação ${numero(u)})`, urgencia: "alta" };
  const a = p("pedido_atendente");
  if (typeof a === "number" && a >= limites.pedido_atendente && !escolheProfissionalSemPedirAtendente(mensagem))
    return { motivo: `JEV_PEDIDO_ATENDENTE: paciente pediu atendente (pontuação ${numero(a)})`, urgencia: "normal" };
  const i = p("irritacao");
  if (typeof i === "number" && i >= limites.irritacao)
    return { motivo: `JEV_IRRITACAO: paciente insatisfeito (pontuação ${numero(i)})`, urgencia: "normal" };
  if (naoEntendeu(respostas?.entendimento) && contagem?.esclarecimento && contagem.falhas >= FALHAS_PARA_ENCAMINHAR)
    return {
      motivo: `JEV_DUVIDA_REPETIDA: pedido não compreendido em ${contagem.falhas} mensagens seguidas, sem avanço do atendimento (entendimento ${contagem.confiancas.map(numero).join(" e ")})`,
      urgencia: "normal",
    };
  return null;
}

/** Texto legível do motivo, sem o código técnico (ex.: para o resumo da equipe). */
export function motivoLegivel(motivo: string): string {
  return motivo.replace(/^(?:JEV_[A-Z_]+|LISTA_PROFISSIONAIS_EXTENSA):\s*/, "");
}
