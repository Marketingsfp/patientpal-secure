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
import { saudacaoPorHorario } from "./atendimento-fase1";
import { FUSO_PADRAO } from "@/lib/nina-agora";

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

/** Frase de apresentação padrão (usada como reforço quando o modelo esquece). */
export function fraseApresentacao(
  nomeCurtoUnidade: string,
  opcoes?: { fuso?: string; now?: Date; comAbertura?: boolean },
): string {
  const saud = saudacaoPorHorario(opcoes?.fuso ?? FUSO_PADRAO, opcoes?.now ?? new Date());
  const abertura = opcoes?.comAbertura === false ? "" : " Como posso te ajudar hoje?";
  return `Olá, ${saud.toLowerCase()}! 😊 Sou a Nina, assistente virtual da ${nomeCurtoUnidade}.${abertura}`;
}

/**
 * Aplica a regra: se a apresentação é obrigatória e a resposta gerada não a
 * contém, prefixa a apresentação sem alterar o conteúdo da resposta.
 */
export function aplicarSaudacaoObrigatoria(
  texto: string,
  nomeCurtoUnidade: string,
  opcoes?: { fuso?: string; now?: Date },
): string {
  const resposta = (texto ?? "").trim();
  if (saudacaoCompleta(resposta, nomeCurtoUnidade)) return resposta;
  const soSaudacao = resposta.length === 0;
  const frase = fraseApresentacao(nomeCurtoUnidade, {
    ...(opcoes?.fuso ? { fuso: opcoes.fuso } : {}),
    ...(opcoes?.now ? { now: opcoes.now } : {}),
    comAbertura: soSaudacao || !/\?/.test(resposta),
  });
  if (soSaudacao) return frase;
  // Evita duplicar cumprimento: remove um "Olá/Oi/Bom dia..." inicial da resposta.
  const limpo = resposta.replace(
    /^((ol[áa]|oi|bom dia|boa tarde|boa noite)[,!.\s]*)+/i,
    "",
  );
  return `${frase} ${limpo}`.trim();
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
