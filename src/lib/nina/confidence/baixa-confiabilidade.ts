/**
 * REGRA OBRIGATÓRIA — BAIXA CONFIABILIDADE ENCAMINHA PARA HUMANO.
 *
 * Complementa (e prevalece sobre) as fases anteriores: quando a avaliação
 * FINAL da resposta resulta em nível LOW / Baixa, o conteúdo candidato NÃO vai
 * para o paciente em nenhuma representação (texto, áudio ou resumo falado).
 * O paciente recebe apenas um aviso controlado de encaminhamento.
 *
 * Pontos que esta camada garante:
 *
 *  - o nível vem da classificação vigente na configuração da clínica
 *    (`limites` da política efetiva). Nenhum número novo é criado aqui;
 *  - a regra vale inclusive na etapa de ativação A (que só observa) — ela é
 *    proteção obrigatória, e a precedência fica registrada;
 *  - vale mesmo quando a decisão recomendada pelo motor for CLARIFY: para uma
 *    resposta LOW o destino definido pelo produto é atendimento humano;
 *  - produção encaminha de verdade; homologação apenas simula o desfecho, sem
 *    atribuição real, sem fila real e sem notificação real;
 *  - falha no encaminhamento nunca vira sucesso: o candidato continua
 *    bloqueado e o aviso descreve a situação real;
 *  - idempotência: reprocessar o mesmo turno não duplica aviso nem
 *    encaminhamento;
 *  - o aviso é mensagem controlada do sistema: ele é validado pelo próprio
 *    conteúdo e pelo estado do encaminhamento, nunca pela nota do conteúdo
 *    descartado (evita o ciclo de bloquear o próprio aviso).
 *
 * Camada pura: sem banco, sem rede, sem modelo.
 */
import type { NivelConfianca, DecisaoMotor } from "./types";
import type { EtapaAtivacao } from "./etapas";

/** Aviso enviado ao paciente quando o encaminhamento humano foi concluído. */
export const AVISO_ENCAMINHAMENTO_HUMANO =
  "Vou chamar uma pessoa da nossa equipe para continuar seu atendimento por aqui.";

/**
 * Aviso quando o encaminhamento NÃO pôde ser concluído. Descreve a situação
 * sem inventar transferência concluída e sem expor detalhe técnico.
 */
export const AVISO_ENCAMINHAMENTO_FALHOU =
  "Não consegui concluir seu atendimento por aqui agora. Já registrei sua mensagem para que uma pessoa da nossa equipe retome com você.";

/** Aviso exibido na homologação (encaminhamento simulado, sem atribuição). */
export const AVISO_ENCAMINHAMENTO_SIMULADO = AVISO_ENCAMINHAMENTO_HUMANO;

export const MOTIVO_BLOQUEIO_BAIXA_CONFIANCA = "CONFIANCA_BAIXA_ENCAMINHA_HUMANO";

export type AmbienteSaida = "producao" | "homologacao";

export type EntradaBloqueioBaixaConfianca = {
  /** Nível da avaliação FINAL, já classificado pela configuração da clínica. */
  nivel: NivelConfianca | null;
  score: number | null;
  /** Decisão recomendada pelo motor (CLARIFY não dispensa a regra). */
  decisaoMotor: DecisaoMotor | null;
  etapa: EtapaAtivacao | null;
  ambiente: AmbienteSaida;
  /** Identificação da configuração usada na classificação. */
  configId?: string | null;
  /** Já houve encaminhamento humano neste turno (idempotência). */
  jaEncaminhado?: boolean;
  /** O aviso controlado já foi aplicado a este turno (idempotência). */
  avisoJaAplicado?: boolean;
  /** Hash do conteúdo candidato avaliado (rastreabilidade, sem PII). */
  conteudoCandidatoHash?: string | null;
};

export type DecisaoBloqueioBaixaConfianca = {
  /** O conteúdo candidato deve ser descartado para envio? */
  bloquear: boolean;
  /** Precisa acionar o mecanismo de encaminhamento humano agora? */
  encaminhar: boolean;
  motivo: string | null;
  nivel: NivelConfianca | null;
  score: number | null;
  decisaoMotor: DecisaoMotor | null;
  etapa: EtapaAtivacao | null;
  ambiente: AmbienteSaida;
  configId: string | null;
  conteudoCandidatoHash: string | null;
  /** A regra prevalece sobre a etapa de ativação (inclusive A). */
  precedeEtapaAtivacao: boolean;
  /** A regra prevalece sobre a decisão recomendada pelo motor. */
  precedeDecisaoMotor: boolean;
  /** Já aplicado antes: nada é repetido. */
  jaAplicado: boolean;
  explicacao: string;
};

/** A regra observa apenas o nível vigente: LOW / Baixa. */
export function nivelExigeEncaminhamento(nivel: NivelConfianca | null | undefined): boolean {
  return nivel === "LOW";
}

export function decidirBloqueioBaixaConfianca(
  e: EntradaBloqueioBaixaConfianca,
): DecisaoBloqueioBaixaConfianca {
  const aplicavel = nivelExigeEncaminhamento(e.nivel);
  const jaAplicado = e.avisoJaAplicado === true;
  const base = {
    nivel: e.nivel ?? null,
    score: e.score ?? null,
    decisaoMotor: e.decisaoMotor ?? null,
    etapa: e.etapa ?? null,
    ambiente: e.ambiente,
    configId: e.configId ?? null,
    conteudoCandidatoHash: e.conteudoCandidatoHash ?? null,
    jaAplicado,
  };
  if (!aplicavel) {
    return {
      ...base,
      bloquear: false,
      encaminhar: false,
      motivo: null,
      precedeEtapaAtivacao: false,
      precedeDecisaoMotor: false,
      explicacao: `nivel=${e.nivel ?? "indisponivel"}: regra de baixa confiabilidade não se aplica`,
    };
  }
  return {
    ...base,
    bloquear: true,
    // Idempotência: aviso já aplicado ou encaminhamento já feito não repete.
    encaminhar: !jaAplicado && e.jaEncaminhado !== true,
    motivo: MOTIVO_BLOQUEIO_BAIXA_CONFIANCA,
    precedeEtapaAtivacao: true,
    precedeDecisaoMotor: e.decisaoMotor !== null && e.decisaoMotor !== "HANDOFF",
    explicacao: jaAplicado
      ? `nivel=LOW: bloqueio já aplicado neste turno (sem repetição)`
      : `nivel=LOW: conteúdo candidato descartado; destino obrigatório = atendimento humano (etapa=${e.etapa ?? "?"}, decisão do motor=${e.decisaoMotor ?? "?"})`,
  };
}

// ------------------------------------------------- resultado do encaminhamento

export type ResultadoEncaminhamento =
  | { tipo: "real"; confirmado: boolean; comprovacao?: string | null; erro?: string | null }
  | { tipo: "simulado" }
  | { tipo: "nao_executado"; erro?: string | null };

export type SaidaControlada = {
  /** Texto que efetivamente vai ao paciente / à conversa de teste. */
  aviso: string;
  /** Origem declarada da mensagem: sempre mensagem controlada do sistema. */
  origem: "mensagem_controlada_sistema";
  /** O conteúdo candidato foi descartado? */
  candidatoDescartado: true;
  encaminhamento: "real_confirmado" | "real_falhou" | "simulado" | "nao_executado";
  /** Só é `true` com encaminhamento real confirmado. */
  encaminhamentoConfirmado: boolean;
  /** A conversa fica sinalizada para intervenção humana? */
  exigeIntervencao: boolean;
  registro: string;
  erro: string | null;
  /**
   * O aviso é avaliado pelo seu próprio conteúdo e pelo estado do
   * encaminhamento — nunca pela nota do conteúdo descartado.
   */
  herdaNotaDoCandidato: false;
};

/** Monta a saída controlada a partir do resultado real/simulado. */
export function saidaControladaBaixaConfianca(
  resultado: ResultadoEncaminhamento,
): SaidaControlada {
  if (resultado.tipo === "simulado") {
    return {
      aviso: AVISO_ENCAMINHAMENTO_SIMULADO,
      origem: "mensagem_controlada_sistema",
      candidatoDescartado: true,
      encaminhamento: "simulado",
      encaminhamentoConfirmado: false,
      exigeIntervencao: false,
      registro: "Encaminhamento humano simulado por baixa confiabilidade",
      erro: null,
      herdaNotaDoCandidato: false,
    };
  }
  if (resultado.tipo === "real" && resultado.confirmado === true) {
    return {
      aviso: AVISO_ENCAMINHAMENTO_HUMANO,
      origem: "mensagem_controlada_sistema",
      candidatoDescartado: true,
      encaminhamento: "real_confirmado",
      encaminhamentoConfirmado: true,
      exigeIntervencao: false,
      registro: "Encaminhamento humano realizado por baixa confiabilidade",
      erro: null,
      herdaNotaDoCandidato: false,
    };
  }
  const erro =
    (resultado.tipo === "real" ? resultado.erro : resultado.erro) ?? "encaminhamento_nao_confirmado";
  return {
    aviso: AVISO_ENCAMINHAMENTO_FALHOU,
    origem: "mensagem_controlada_sistema",
    candidatoDescartado: true,
    encaminhamento: resultado.tipo === "real" ? "real_falhou" : "nao_executado",
    encaminhamentoConfirmado: false,
    exigeIntervencao: true,
    registro: "Encaminhamento humano por baixa confiabilidade NÃO confirmado",
    erro,
    herdaNotaDoCandidato: false,
  };
}

/** O texto já é um aviso controlado desta regra? (idempotência textual) */
export function ehAvisoControlado(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  return (
    t === AVISO_ENCAMINHAMENTO_HUMANO ||
    t === AVISO_ENCAMINHAMENTO_FALHOU ||
    t.includes(AVISO_ENCAMINHAMENTO_HUMANO) ||
    t.includes(AVISO_ENCAMINHAMENTO_FALHOU)
  );
}
