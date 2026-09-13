/**
 * CADEIA DO TEXTO DO TURNO (camada pura — sem banco, sem rede, sem relógio
 * próprio além do carimbo recebido).
 *
 * O problema que este módulo resolve: em um turno existem VÁRIOS textos —
 * a resposta original do modelo, versões intermediárias (template, saudação,
 * banner de transferência, reescrita por regra) e, no fim, a mensagem
 * realmente entregue, que pode até ser um aviso operacional que o motor nunca
 * avaliou. Guardar só "o texto final" e "uma nota" faz a nota de um texto
 * aparecer como nota de outro.
 *
 * Aqui cada versão é preservada com sua etapa, seu motivo e sua impressão
 * digital; cada avaliação declara QUAL texto avaliou; e o vínculo entre a nota
 * e a mensagem entregue é decidido por comparação de hash — nunca por
 * proximidade. O que não pode ser comprovado é declarado, jamais preenchido.
 */

export const ORIGENS_VERSAO_TEXTO = [
  /** Texto tal como o modelo devolveu. */
  "modelo",
  /** Alteração feita por regra do sistema (template, saudação, banner…). */
  "sistema",
  /** Nova versão pedida ao modelo depois de uma verificação. */
  "modelo_corrigido",
  /** Mensagem controlada do sistema (aviso de bloqueio/encaminhamento). */
  "aviso_operacional",
  /** Finalização da resposta (contrato de saída) aplicada ao texto. */
  "finalizacao",
  /** Texto efetivamente entregue ao paciente. */
  "entrega",
] as const;
export type OrigemVersaoTexto = (typeof ORIGENS_VERSAO_TEXTO)[number];

export type VersaoTexto = {
  /** Posição na cadeia, começando em 1. */
  ordem: number;
  etapa: string;
  motivo: string;
  origem: OrigemVersaoTexto;
  hash: string | null;
  tamanho: number | null;
  /**
   * Texto integral. Fica no registro em memória para a auditoria do turno e
   * só é serializado quando a clínica autorizou o diagnóstico com payload —
   * a mesma regra já aplicada à auditoria das instruções.
   */
  texto: string | null;
  em: string;
};

/** Uma avaliação do turno já ligada ao texto exato que ela avaliou. */
export type AvaliacaoComTexto = {
  avaliacao: string;
  textoHash?: string | null;
  representacao?: string | null;
  score?: number | null;
  nivel?: string | null;
  decisaoId?: string | null;
};

export type MotivoVinculoNota =
  | "hash_confere"
  | "sem_avaliacao"
  | "sem_hash_para_comparar"
  | "texto_alterado_apos_avaliacao"
  | "aviso_operacional_nao_avaliado";

export const TEXTO_MOTIVO_NOTA: Record<MotivoVinculoNota, string> = {
  hash_confere: "A nota é deste texto: o conteúdo entregue confere com o conteúdo avaliado.",
  sem_avaliacao: "Não há avaliação registrada para este turno.",
  sem_hash_para_comparar:
    "Não há impressão digital suficiente para afirmar que a nota é desta mensagem.",
  texto_alterado_apos_avaliacao:
    "O texto mudou depois da avaliação: a nota anterior não vale para a mensagem entregue.",
  aviso_operacional_nao_avaliado:
    "Mensagem operacional do sistema: não recebeu nota do motor (porcentagem não se aplica).",
};

export type VinculoNotaTextoFinal = {
  aplicavel: boolean;
  motivo: MotivoVinculoNota;
  /** A avaliação que descreve o texto entregue (quando existe). */
  avaliacao: AvaliacaoComTexto | null;
};

/**
 * A nota registrada no turno pode ser apresentada como nota da mensagem
 * entregue? Só quando o hash do texto avaliado é o hash do texto entregue.
 * Aviso operacional nunca herda nota — nem a do texto que ele substituiu.
 */
export function notaAplicavelAoTextoFinal(args: {
  avaliacoes: readonly AvaliacaoComTexto[];
  hashFinal: string | null | undefined;
  avisoOperacional?: boolean;
}): VinculoNotaTextoFinal {
  if (args.avisoOperacional === true) {
    return { aplicavel: false, motivo: "aviso_operacional_nao_avaliado", avaliacao: null };
  }
  const avaliacoes = args.avaliacoes ?? [];
  if (avaliacoes.length === 0) {
    return { aplicavel: false, motivo: "sem_avaliacao", avaliacao: null };
  }
  const hashFinal = args.hashFinal ?? null;
  if (!hashFinal) {
    return { aplicavel: false, motivo: "sem_hash_para_comparar", avaliacao: null };
  }
  const exata = [...avaliacoes].reverse().find((a) => a.textoHash && a.textoHash === hashFinal);
  if (exata) return { aplicavel: true, motivo: "hash_confere", avaliacao: exata };
  const comHash = avaliacoes.some((a) => Boolean(a.textoHash));
  return {
    aplicavel: false,
    motivo: comHash ? "texto_alterado_apos_avaliacao" : "sem_hash_para_comparar",
    avaliacao: null,
  };
}

/* ------------------------------------------------- avisos operacionais */

export const VALIDACOES_AVISO = [
  "encaminhamento_confirmado",
  "encaminhamento_simulado",
  "encaminhamento_pendente",
  "encaminhamento_falhou",
  "nao_verificada",
] as const;
export type ValidacaoAviso = (typeof VALIDACOES_AVISO)[number];

export const TEXTO_VALIDACAO_AVISO: Record<ValidacaoAviso, string> = {
  encaminhamento_confirmado: "Encaminhamento para atendimento humano confirmado",
  encaminhamento_simulado: "Homologação: encaminhamento simbólico, sem fila real",
  encaminhamento_pendente: "Encaminhamento já registrado antes neste atendimento",
  encaminhamento_falhou: "Encaminhamento não confirmado — falha registrada",
  nao_verificada: "Validação do encaminhamento não registrada",
};

/** Por que um aviso operacional não tem porcentagem de confiança. */
export const MOTIVO_SEM_NOTA_AVISO = "aviso_operacional_nao_avaliado_pelo_motor";

export type AvisoOperacionalRegistrado = {
  /** Quem entregou o aviso: a finalização da Nina ou o módulo de protocolo. */
  origem: string;
  /** Que aviso é este (baixa confiabilidade, bloqueio por regra, protocolo). */
  tipo: string;
  motivo: string;
  validacao: ValidacaoAviso;
  /** Aviso do sistema nunca recebe nota do motor. */
  notaAplicavel: false;
  motivoSemNota: typeof MOTIVO_SEM_NOTA_AVISO;
  textoHash: string | null;
  protocolo: string | null;
  mensagemId: string | null;
  execucaoId: string | null;
  handoffEventoId: string | null;
  em: string;
};

/** Traduz o resultado do encaminhamento na validação do aviso. */
export function validacaoDoEncaminhamento(
  r:
    | { tipo: "real"; confirmado: boolean; erro?: string | null }
    | { tipo: "simulado" }
    | null
    | undefined,
): ValidacaoAviso {
  if (!r) return "nao_verificada";
  if (r.tipo === "simulado") return "encaminhamento_simulado";
  return r.confirmado ? "encaminhamento_confirmado" : "encaminhamento_falhou";
}

/* ------------------------------------------ evidência do bloqueio */

/**
 * A avaliação que CAUSOU o bloqueio é a prova do bloqueio: fica preservada
 * com o hash do texto que recebeu aquela nota, para ninguém confundir a nota
 * do conteúdo descartado com a nota do aviso entregue.
 */
export type EvidenciaBloqueio = {
  tipo: "baixa_confiabilidade" | "regra_publicada";
  motivo: string;
  avaliacao: string;
  decisaoId: string | null;
  /** Texto que recebeu a nota (o conteúdo descartado). */
  textoAvaliadoHash: string | null;
  score: number | null;
  nivel: string | null;
  etapa: string | null;
  /** Texto que passou a ser entregue no lugar. */
  textoSubstitutoHash: string | null;
  em: string;
};

/* ------------------------------------------------------------ serialização */

/** Versões para o trace: hash sempre; texto só com diagnóstico autorizado. */
export function versoesParaTrace(
  versoes: readonly VersaoTexto[],
  diagnostico: boolean,
): Array<Record<string, unknown>> {
  return versoes.map((v) => ({
    ordem: v.ordem,
    etapa: v.etapa,
    motivo: v.motivo,
    origem: v.origem,
    hash: v.hash,
    tamanho: v.tamanho,
    em: v.em,
    ...(diagnostico ? { texto: v.texto } : {}),
  }));
}
