/**
 * FASE 6 — IDENTIDADE DA RESPOSTA AVALIADA E ENTREGUE (camada pura).
 *
 * O problema que este módulo resolve: uma nota calculada sobre o TEXTO
 * completo estava aparecendo como se fosse avaliação do ÁUDIO — inclusive
 * quando o áudio é um resumo falado, com outro conteúdo. E os leitores do
 * painel procuravam o snapshot só pela execução, ignorando a mensagem, a
 * representação e a impressão digital do conteúdo.
 *
 * Aqui ficam as regras de correspondência, sem banco, sem rede e sem relógio:
 *
 *  - uma avaliação só descreve uma saída quando clínica, conversa, turno,
 *    execução, mensagem, representação e hash do conteúdo batem;
 *  - conteúdo diferente NUNCA herda a nota de outro conteúdo;
 *  - registro antigo, sem hash ou sem vínculo, é declarado como tal em vez de
 *    ser reescrito para parecer completo;
 *  - "resultado registrado" é o efeito comprovado, não a tradução automática
 *    de uma recomendação (CLARIFY não é "pediu esclarecimento ao paciente").
 */
import { hashDoTexto } from "./hash";
import type { RepresentacaoSaida } from "./entrega";

export type { RepresentacaoSaida };

/** Prefixo com que o áudio da Nina é gravado no histórico da conversa. */
const PREFIXO_AUDIO = "🎤";

/**
 * Qual saída esta bolha da conversa representa e qual conteúdo dela é
 * comparável com o que foi avaliado.
 */
export function representacaoDaMensagem(msg: {
  tipo?: string | null;
  texto?: string | null;
  transcricao?: string | null;
}): { representacao: RepresentacaoSaida | "audio"; conteudo: string | null } {
  const bruto = msg.transcricao ?? msg.texto ?? null;
  const tipo = (msg.tipo ?? "").toLowerCase();
  if (tipo === "audio") {
    const limpo =
      bruto && bruto.startsWith(PREFIXO_AUDIO) ? bruto.slice(PREFIXO_AUDIO.length).trim() : bruto;
    // Só o registro do motor sabe se o áudio foi integral ou resumo falado;
    // a bolha não adivinha. Fica "audio" e a correspondência decide.
    return { representacao: "audio", conteudo: limpo ?? null };
  }
  return { representacao: "texto_completo", conteudo: bruto ?? null };
}

/** Uma avaliação gravada, como ela chega do banco (campos podem faltar). */
export type AvaliacaoRegistrada = {
  clinicaId?: string | null;
  conversaId?: string | null;
  execucaoId?: string | null;
  outgoingMessageId?: string | null;
  representacao?: string | null;
  textoHash?: string | null;
  avaliacao?: string | null;
  criadoEm?: string | null;
};

/** A saída concreta que o painel está tentando explicar. */
export type AlvoDaSaida = {
  clinicaId: string;
  conversaId?: string | null;
  execucaoId?: string | null;
  outgoingMessageId?: string | null;
  /** `audio` = a bolha é áudio e ainda não se sabe se integral ou resumo. */
  representacao: RepresentacaoSaida | "audio";
  /** Conteúdo realmente entregue (para calcular o hash) — quando conhecido. */
  conteudo?: string | null;
  textoHash?: string | null;
};

export type MotivoVinculo =
  /** Clínica, turno, mensagem, representação e conteúdo conferem. */
  | "vinculo_exato"
  /** Não existe nenhuma avaliação para esta saída. */
  | "sem_avaliacao"
  /** Existe avaliação, mas de um conteúdo diferente do que foi entregue. */
  | "conteudo_divergente"
  /** A avaliação é de outra representação (texto x áudio x resumo falado). */
  | "outra_representacao"
  /** Registro anterior ao hash: dá para casar por turno, não por conteúdo. */
  | "registro_antigo_sem_hash"
  /** Faltam identificadores para afirmar que a avaliação é desta saída. */
  | "vinculo_incompleto"
  /** Existe avaliação, mas de outra clínica, conversa ou turno. */
  | "outro_escopo";

export const TEXTO_MOTIVO_VINCULO: Record<MotivoVinculo, string> = {
  vinculo_exato: "Avaliação desta mensagem, conferida pelo conteúdo entregue.",
  sem_avaliacao: "Esta saída não tem avaliação registrada.",
  conteudo_divergente:
    "O conteúdo entregue é diferente do conteúdo avaliado: a nota não vale para esta saída.",
  outra_representacao:
    "A avaliação registrada é de outra forma de entrega (texto, áudio ou resumo falado).",
  registro_antigo_sem_hash:
    "Registro antigo: dá para ligar ao atendimento, mas não há como conferir o conteúdo.",
  vinculo_incompleto: "Faltam vínculos para afirmar que esta avaliação é desta saída.",
  outro_escopo: "A avaliação encontrada pertence a outra clínica, conversa ou atendimento.",
};

export type EscolhaDeAvaliacao<T extends AvaliacaoRegistrada> = {
  avaliacao: T | null;
  motivo: MotivoVinculo;
  /** Pode ser apresentada como avaliação DESTA saída? */
  suficiente: boolean;
  /** O conteúdo entregue foi conferido contra o conteúdo avaliado? */
  conteudoConferido: boolean;
};

function mesmaFamiliaDeRepresentacao(
  daAvaliacao: string | null | undefined,
  doAlvo: RepresentacaoSaida | "audio",
): boolean {
  const r = daAvaliacao ?? "texto_completo";
  if (doAlvo === "audio") return r === "audio_integral" || r === "audio_resumo";
  return r === doAlvo;
}

/**
 * Escolhe, entre as avaliações gravadas, a que realmente descreve esta saída.
 *
 * Nunca "aproxima": quando o conteúdo diverge, quando a representação é outra
 * ou quando faltam vínculos, o resultado diz isso — e a nota não é usada.
 */
export function selecionarAvaliacaoDaSaida<T extends AvaliacaoRegistrada>(
  candidatas: ReadonlyArray<T>,
  alvo: AlvoDaSaida,
): EscolhaDeAvaliacao<T> {
  const hashAlvo =
    alvo.textoHash ?? (alvo.conteudo != null ? hashDoTexto(alvo.conteudo) : null);

  const noEscopo = candidatas.filter((c) => {
    if (c.clinicaId && c.clinicaId !== alvo.clinicaId) return false;
    if (c.conversaId && alvo.conversaId && c.conversaId !== alvo.conversaId) return false;
    if (c.execucaoId && alvo.execucaoId && c.execucaoId !== alvo.execucaoId) return false;
    if (
      c.outgoingMessageId &&
      alvo.outgoingMessageId &&
      c.outgoingMessageId !== alvo.outgoingMessageId
    ) {
      return false;
    }
    return true;
  });

  if (candidatas.length === 0) {
    return { avaliacao: null, motivo: "sem_avaliacao", suficiente: false, conteudoConferido: false };
  }
  if (noEscopo.length === 0) {
    return { avaliacao: null, motivo: "outro_escopo", suficiente: false, conteudoConferido: false };
  }

  const mesmaRepresentacao = noEscopo.filter((c) =>
    mesmaFamiliaDeRepresentacao(c.representacao, alvo.representacao),
  );

  // 1) Vínculo exato: mesma representação e mesmo conteúdo.
  if (hashAlvo) {
    const exata = mesmaRepresentacao.find((c) => c.textoHash && c.textoHash === hashAlvo);
    if (exata) {
      return {
        avaliacao: exata,
        motivo: "vinculo_exato",
        suficiente: true,
        conteudoConferido: true,
      };
    }
  }

  // 2) Mesma representação, conteúdo diferente: o texto mudou depois da
  //    avaliação, ou o que saiu não é o que foi avaliado. Não vale.
  const comHash = mesmaRepresentacao.find((c) => Boolean(c.textoHash));
  if (comHash && hashAlvo) {
    return {
      avaliacao: comHash,
      motivo: "conteudo_divergente",
      suficiente: false,
      conteudoConferido: true,
    };
  }

  // 3) Registro antigo (sem hash) ou saída sem conteúdo conhecido.
  const semHash = mesmaRepresentacao.find((c) => !c.textoHash);
  if (semHash || (comHash && !hashAlvo)) {
    const escolhida = (semHash ?? comHash)!;
    // Áudio jamais herda avaliação que não dá para conferir: o resumo falado
    // costuma ter conteúdo diferente do texto.
    if (alvo.representacao === "audio") {
      return {
        avaliacao: escolhida,
        motivo: hashAlvo ? "vinculo_incompleto" : "vinculo_incompleto",
        suficiente: false,
        conteudoConferido: false,
      };
    }
    return {
      avaliacao: escolhida,
      motivo: hashAlvo ? "registro_antigo_sem_hash" : "vinculo_incompleto",
      suficiente: true,
      conteudoConferido: false,
    };
  }

  // 4) Só existe avaliação de outra representação: nunca é apresentada como
  //    avaliação desta. É exatamente o caso do resumo falado herdando a nota
  //    do texto completo.
  return {
    avaliacao: null,
    motivo: "outra_representacao",
    suficiente: false,
    conteudoConferido: false,
  };
}

/**
 * O conteúdo preparado para fala precisa de avaliação PRÓPRIA? Sim sempre que
 * ele diferir do texto avaliado — inclusive quando a diferença veio só do
 * preparo para fala.
 */
export function falaPrecisaDeAvaliacaoPropria(args: {
  textoAvaliadoHash: string | null | undefined;
  conteudoFalado: string;
}): { precisa: boolean; hashFalado: string | null } {
  const hashFalado = hashDoTexto(args.conteudoFalado);
  const igual = Boolean(args.textoAvaliadoHash) && args.textoAvaliadoHash === hashFalado;
  return { precisa: !igual, hashFalado };
}

/**
 * "Resultado registrado" é o efeito COMPROVADO do turno. Recomendação do motor
 * (CLARIFY, HANDOFF, BLOCK_ACTION) não é efeito e nunca é traduzida como se
 * fosse: sem efeito gravado, o painel diz que não há efeito registrado.
 */
export const TEXTO_SEM_EFEITO = "Não registrado";

export function resultadoRegistrado(args: {
  resultadoFinal?: string | null;
  rotulo?: (valor: string) => string | null;
}): string {
  const bruto = args.resultadoFinal ?? null;
  if (!bruto) return TEXTO_SEM_EFEITO;
  return args.rotulo?.(bruto) ?? bruto;
}

/**
 * A avaliação que o selo da Inbox recebeu descreve ESTA bolha? Usada para não
 * pintar o selo do texto completo em cima de um áudio com outro conteúdo.
 */
export function confiancaAplicavelAMensagem(
  confianca: {
    representacao?: string | null;
    texto_final_hash?: string | null;
    avaliacao?: string | null;
  },
  mensagem: { tipo?: string | null; texto?: string | null; transcricao?: string | null },
): { aplicavel: boolean; motivo: MotivoVinculo } {
  const { representacao, conteudo } = representacaoDaMensagem(mensagem);
  const escolha = selecionarAvaliacaoDaSaida(
    [
      {
        representacao: confianca.representacao ?? null,
        textoHash: confianca.texto_final_hash ?? null,
      },
    ],
    { clinicaId: "-", representacao, conteudo },
  );
  return { aplicavel: escolha.suficiente, motivo: escolha.motivo };
}
