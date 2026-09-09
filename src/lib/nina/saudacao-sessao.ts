/**
 * SAUDAÇÃO OBRIGATÓRIA DA PRIMEIRA RESPOSTA DE CADA SESSÃO DA NINA.
 *
 * Regra estrutural (não é prompt): toda sessão operacional nova da Nina —
 * conversa nova, sessão expirada por TTL, ou conversa resolvida que voltou a
 * receber mensagem — precisa que a PRIMEIRA resposta contenha:
 *   saudação por horário + "Nina" + "assistente virtual" + nome da unidade
 *   + abertura ("como posso te ajudar").
 *
 * O modelo continua escrevendo o texto. Este módulo garante o estado
 * (`session_id` + `greeting_completed`) e valida/corrige a resposta antes de
 * ela sair. Puro: sem banco, sem rede.
 */
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import { novoSessionId } from "./sessao";

export type SessaoSaudacao = {
  estado: EstadoFluxoNina;
  /** A sessão operacional foi criada agora (não existia `session_id`). */
  novaSessao: boolean;
  /** A próxima resposta da Nina precisa conter a apresentação completa. */
  saudacaoObrigatoria: boolean;
};

/**
 * Garante que exista uma sessão operacional identificada. Sem `session_id`
 * (conversa nova ou estado antigo), abre uma sessão e exige a apresentação.
 */
export function garantirSessaoAtiva(
  estado: EstadoFluxoNina,
  opcoes?: { jaRespondeuNestaSessao?: boolean; agoraISO?: string },
): SessaoSaudacao {
  const agoraISO = opcoes?.agoraISO ?? new Date().toISOString();
  if (!estado.session_id) {
    // Estado legado sem sessão: se a Nina já respondeu dentro da janela de
    // memória, não force uma apresentação no meio do atendimento.
    const jaRespondeu = Boolean(opcoes?.jaRespondeuNestaSessao);
    return {
      estado: {
        ...estado,
        session_id: novoSessionId(),
        session_started_at: agoraISO,
        greeting_completed: jaRespondeu,
      },
      novaSessao: !jaRespondeu,
      saudacaoObrigatoria: !jaRespondeu,
    };
  }
  return {
    estado,
    novaSessao: false,
    saudacaoObrigatoria: estado.greeting_completed !== true,
  };
}

/** Marca a apresentação como já feita nesta sessão. */
export function marcarSaudacaoConcluida(estado: EstadoFluxoNina): EstadoFluxoNina {
  return { ...estado, greeting_completed: true };
}

function semAcento(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export type ElementosSaudacao = {
  saudacao: boolean;
  nina: boolean;
  assistenteVirtual: boolean;
  unidade: boolean;
  abertura: boolean;
};

/** Verifica, semanticamente, os elementos obrigatórios da apresentação. */
export function checarElementosSaudacao(
  texto: string,
  nomeCurtoUnidade: string,
): ElementosSaudacao {
  const t = semAcento(texto ?? "");
  const unidade = semAcento(nomeCurtoUnidade ?? "")
    .replace(/^(policlinica|clinica|hospital)\s+/, "")
    .trim();
  return {
    saudacao: /\b(bom dia|boa tarde|boa noite|ola|oi)\b/.test(t),
    nina: /\bnina\b/.test(t),
    assistenteVirtual: /assistente virtual/.test(t),
    unidade: unidade.length > 0 ? t.includes(unidade) : true,
    abertura: /(ajudar|ajudo|posso te ajudar|em que posso|como posso)/.test(t),
  };
}

export function saudacaoCompleta(texto: string, nomeCurtoUnidade: string): boolean {
  const e = checarElementosSaudacao(texto, nomeCurtoUnidade);
  return e.saudacao && e.nina && e.assistenteVirtual && e.unidade && e.abertura;
}

export type DiagnosticoSaudacao = {
  /** A apresentação obrigatória era esperada nesta resposta. */
  obrigatoria: boolean;
  /** Todos os elementos da apresentação estão presentes. */
  completa: boolean;
  elementos: ElementosSaudacao;
  /** A resposta apresentou a Nina mais de uma vez. */
  saudacaoDuplicada: boolean;
  /** Era obrigatória e o modelo não apresentou a Nina. */
  saudacaoAusente: boolean;
};

/**
 * FASE 6 — validação NÃO MUTANTE da apresentação.
 *
 * O comportamento conversacional (inclusive a apresentação) vem exclusivamente
 * do Behavior Prompt publicado em Arquitetura. Este módulo apenas OBSERVA a
 * resposta gerada e devolve telemetria; nunca reescreve o texto, para não
 * produzir apresentações duplicadas ("Sou a Nina... Sou a Nina...").
 */
export function avaliarSaudacao(
  texto: string,
  nomeCurtoUnidade: string,
  opcoes?: { obrigatoria?: boolean },
): DiagnosticoSaudacao {
  const resposta = (texto ?? "").trim();
  const elementos = checarElementosSaudacao(resposta, nomeCurtoUnidade);
  const completa =
    elementos.saudacao &&
    elementos.nina &&
    elementos.assistenteVirtual &&
    elementos.unidade &&
    elementos.abertura;
  const t = semAcento(resposta);
  const apresentacoes = (t.match(/sou a nina|assistente virtual/g) ?? []).length;
  const obrigatoria = opcoes?.obrigatoria !== false;
  return {
    obrigatoria,
    completa,
    elementos,
    saudacaoDuplicada: apresentacoes > 1,
    saudacaoAusente: obrigatoria && !completa,
  };
}

/** Informação de depuração (somente QA/homologação — nunca vai ao paciente). */
export function debugSessaoNina(
  estado: EstadoFluxoNina,
  info: { novaSessao: boolean; saudacaoObrigatoria: boolean },
): {
  nina_session_id: string | null;
  new_session: boolean;
  greeting_required: boolean;
  greeting_completed: boolean;
  conversation_state: string;
} {
  return {
    nina_session_id: estado.session_id ?? null,
    new_session: info.novaSessao,
    greeting_required: info.saudacaoObrigatoria,
    greeting_completed: estado.greeting_completed === true,
    conversation_state: estado.flow.stage,
  };
}
