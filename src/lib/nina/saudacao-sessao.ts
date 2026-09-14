/**
 * SAUDAÇÃO OBRIGATÓRIA DA PRIMEIRA RESPOSTA DE CADA SESSÃO DA NINA.
 *
 * Regra estrutural (não é prompt): toda sessão operacional nova da Nina —
 * conversa nova, sessão expirada por TTL, ou conversa resolvida que voltou a
 * receber mensagem — precisa que a PRIMEIRA resposta contenha:
 *   saudação por horário + identidade publicada + identificação virtual
 *   + abertura ("como posso te ajudar").
 *
 * O modelo continua escrevendo o texto. Este módulo garante o estado
 * (`session_id` + `greeting_completed`) e observa a apresentação sem alterar
 * a resposta. Puro: sem banco, sem rede.
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

/**
 * FASE 3 — a apresentação é conferida contra a IDENTIDADE PUBLICADA do turno,
 * nunca contra a palavra "Nina" nem contra o nome administrativo da clínica.
 */
export type IdentidadeApresentacao = {
  /** Nome da atendente virtual publicado na Arquitetura. */
  assistente?: string | null;
  /** Nome do estabelecimento publicado na Arquitetura. */
  estabelecimento?: string | null;
};

export type EntradaIdentidadeSaudacao = string | IdentidadeApresentacao;

function normalizarIdentidade(entrada: EntradaIdentidadeSaudacao): {
  assistente: string;
  estabelecimento: string;
} {
  // Compatibilidade: chamadas antigas passavam só o nome curto da unidade.
  if (typeof entrada === "string") {
    return { assistente: "", estabelecimento: entrada ?? "" };
  }
  return {
    assistente: entrada?.assistente ?? "",
    estabelecimento: entrada?.estabelecimento ?? "",
  };
}

function escaparRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ElementosSaudacao = {
  saudacao: boolean;
  /** O nome da assistente PUBLICADO aparece na resposta. */
  assistente: boolean;
  assistenteVirtual: boolean;
  unidade: boolean;
  abertura: boolean;
};

/** Verifica, semanticamente, os elementos obrigatórios da apresentação. */
export function checarElementosSaudacao(
  texto: string,
  identidadeOuUnidade?: EntradaIdentidadeSaudacao,
): ElementosSaudacao {
  const t = semAcento(texto ?? "");
  const ident = normalizarIdentidade(identidadeOuUnidade ?? "");
  const unidade = semAcento(ident.estabelecimento)
    // Não duplica o tipo do estabelecimento na comparação.
    .replace(/^(policlinica|clinica|hospital|unidade|centro)\s+/, "")
    .trim();
  const assistente = semAcento(ident.assistente).trim();
  return {
    saudacao: /\b(bom dia|boa tarde|boa noite|ola|oi)\b/.test(t),
    // Sem identidade publicada não há nome a exigir: o elemento não reprova.
    assistente: assistente.length > 0 ? t.includes(assistente) : true,
    assistenteVirtual: /\b(?:assistente|atendente)\s+virtual\b/.test(t),
    unidade: unidade.length > 0 ? t.includes(unidade) : true,
    abertura: /(ajudar|ajudo|posso te ajudar|em que posso|como posso)/.test(t),
  };
}

export function saudacaoCompleta(
  texto: string,
  identidadeOuUnidade: EntradaIdentidadeSaudacao,
): boolean {
  const e = checarElementosSaudacao(texto, identidadeOuUnidade);
  return e.saudacao && e.assistente && e.assistenteVirtual && e.unidade && e.abertura;
}

/**
 * Apresentar a identidade é diferente de perguntar como ajudar. No primeiro
 * pedido concreto a Nina pode se apresentar e responder diretamente ao pedido.
 * Quem chama esta função ainda precisa comprovar que o texto foi entregue.
 */
export function contemApresentacaoPublicada(
  texto: string,
  identidade: IdentidadeApresentacao,
): boolean {
  const nome = semAcento(identidade.assistente ?? "").trim();
  if (!nome || !identidade.estabelecimento?.trim()) return false;
  const t = semAcento(texto ?? "");
  const apresentacao = new RegExp(
    `\\b(?:(?:eu\\s+)?sou|aqui\\s+e|me\\s+chamo)\\s+(?:a\\s+|o\\s+)?${escaparRegex(nome)}\\b`,
  ).exec(t);
  if (!apresentacao || /\bnao\s*$/.test(t.slice(0, apresentacao.index))) return false;
  const elementos = checarElementosSaudacao(texto, identidade);
  return elementos.assistente && elementos.assistenteVirtual && elementos.unidade;
}

export type MensagemSaudacaoEntregue = {
  id?: string | null;
  conversa_id?: string | null;
  direction?: string | null;
  body?: string | null;
  status?: string | null;
  created_at?: string | null;
  is_teste?: boolean | null;
  enviada_por?: string | null;
};

/**
 * Reconstitui uma marcação perdida a partir da apresentação que realmente
 * saiu nesta sessão. Uma resposta qualquer, um candidato não enviado ou uma
 * apresentação de outra sessão/identidade não constitui essa prova.
 */
export function recuperarSaudacaoEntregue(
  estado: EstadoFluxoNina,
  mensagens: readonly MensagemSaudacaoEntregue[],
  identidade: IdentidadeApresentacao,
  contexto: { conversaId: string | null; teste: boolean; agoraISO?: string },
): { estado: EstadoFluxoNina; recuperada: boolean; mensagemId: string | null } {
  const semRecuperacao = { estado, recuperada: false, mensagemId: null };
  const inicio = Date.parse(estado.session_started_at ?? "");
  const agora = Date.parse(contexto.agoraISO ?? new Date().toISOString());
  const nome = semAcento(identidade.assistente ?? "").trim();
  if (
    estado.greeting_completed === true ||
    !estado.session_id ||
    !contexto.conversaId ||
    !Number.isFinite(inicio) ||
    !Number.isFinite(agora) ||
    !nome ||
    !identidade.estabelecimento?.trim()
  )
    return semRecuperacao;

  const entregue = mensagens.find((m) => {
    if (
      !m.id ||
      m.conversa_id !== contexto.conversaId ||
      (m.is_teste === true) !== contexto.teste ||
      m.direction !== "out" ||
      m.enviada_por !== "nina" ||
      !["sent", "delivered", "read"].includes(m.status ?? "")
    )
      return false;
    const data = Date.parse(m.created_at ?? "");
    return (
      Number.isFinite(data) &&
      data >= inicio &&
      data <= agora &&
      contemApresentacaoPublicada(m.body ?? "", identidade)
    );
  });
  return entregue
    ? { estado: marcarSaudacaoConcluida(estado), recuperada: true, mensagemId: entregue.id! }
    : semRecuperacao;
}

export type DiagnosticoSaudacao = {
  /** A apresentação obrigatória era esperada nesta resposta. */
  obrigatoria: boolean;
  /** Todos os elementos da apresentação estão presentes. */
  completa: boolean;
  elementos: ElementosSaudacao;
  /** A resposta apresentou a assistente mais de uma vez. */
  saudacaoDuplicada: boolean;
  /** Era obrigatória e o modelo não fez a apresentação publicada. */
  saudacaoAusente: boolean;
};

/**
 * FASE 6 — validação NÃO MUTANTE da apresentação.
 *
 * O comportamento conversacional (inclusive quando e como se apresentar) vem
 * exclusivamente do Behavior Prompt publicado em Arquitetura. Este módulo
 * apenas OBSERVA a resposta gerada e devolve telemetria; nunca reescreve o
 * texto e nunca acrescenta obrigação de apresentação fora do prompt.
 */
export function avaliarSaudacao(
  texto: string,
  identidadeOuUnidade: EntradaIdentidadeSaudacao,
  opcoes?: { obrigatoria?: boolean },
): DiagnosticoSaudacao {
  const resposta = (texto ?? "").trim();
  const elementos = checarElementosSaudacao(resposta, identidadeOuUnidade);
  const completa =
    elementos.saudacao &&
    elementos.assistente &&
    elementos.assistenteVirtual &&
    elementos.unidade &&
    elementos.abertura;
  const t = semAcento(resposta);
  const nome = semAcento(normalizarIdentidade(identidadeOuUnidade).assistente).trim();
  const apresentacoes = nome
    ? (
        t.match(
          new RegExp(
            `sou a ${escaparRegex(nome)}|${escaparRegex(nome)}[,]? (?:assistente|atendente)\\s+virtual`,
            "g",
          ),
        ) ?? []
      ).length
    : (
        t.match(
          /sou a (?:assistente|atendente)\s+virtual|(?:assistente|atendente)\s+virtual d[aeo]/g,
        ) ?? []
      ).length;
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
