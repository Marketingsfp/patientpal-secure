/**
 * FASE 4 — DECISION ENGINE DE HANDOFF.
 *
 * Confiança baixa, sozinha, NÃO é motivo para chamar atendente. A decisão
 * combina cinco coisas:
 *
 *   1. o MOTIVO da incerteza (falta dado do paciente? falta fonte oficial?);
 *   2. o TIPO do turno (saudação, esclarecimento, informação, operação);
 *   3. a RECUPERABILIDADE (a Nina resolve perguntando uma coisa?);
 *   4. a SEGURANÇA DA AÇÃO (`actionSafety`, avaliada à parte da nota do texto);
 *   5. a POLÍTICA operacional (pedido explícito por humano, insatisfação,
 *      limite de tentativas de esclarecimento).
 *
 * Camada pura: sem banco, sem rede, sem modelo. A decisão do motor de
 * confiança continua preservada para auditoria — aqui ela é interpretada.
 */
import type { TipoTurno } from "./turno-tipo";
import type { ResultadoConfianca } from "./types";

/** O que o pipeline deve fazer neste turno. */
export type DecisaoDeHandoff =
  | "CONTINUE"
  | "CLARIFY"
  | "BLOCK_ACTION"
  | "HANDOFF";

/** Por que essa decisão foi tomada — vai para a auditoria, sem PII. */
export type MotivoDecisaoHandoff =
  | "GREETING"
  | "MISSING_PATIENT_CONTEXT"
  | "MISSING_REQUIRED_SOURCE"
  | "CRITICAL_ACTION_BLOCKED"
  | "EXPLICIT_HUMAN_REQUEST"
  | "REPEATED_CLARIFICATION_FAILURE"
  | "PATIENT_DISSATISFACTION"
  | "LOW_CONFIDENCE_UNRECOVERABLE"
  | "PUBLISHED_EXCEPTION"
  | "ANSWER_ALLOWED";

/**
 * Política operacional da recuperação. Todo número mágico vive AQUI — nada de
 * limite espalhado pelo código. Valor inicial prudente: a Nina pode esclarecer
 * duas vezes antes de considerar que não vai avançar sozinha.
 */
export type PoliticaRecuperacao = {
  /** Tentativas de esclarecimento antes de encaminhar para humano. */
  maxTentativasEsclarecimento: number;
};

export const POLITICA_RECUPERACAO_PADRAO: PoliticaRecuperacao = {
  maxTentativasEsclarecimento: 2,
};

export type EntradaDecisaoHandoff = {
  /** Avaliação de SEGURANÇA DA AÇÃO produzida pelo motor. */
  avaliacaoAcao: ResultadoConfianca;
  /** Decisão já filtrada pela etapa de ativação da clínica. */
  decisaoEfetiva: ResultadoConfianca["decision"];
  tipoTurno: TipoTurno | null;
  /** O paciente pediu atendente com todas as letras. */
  pedidoHumanoExplicito?: boolean;
  /** Regra de insatisfação/frustração já existente disparou. */
  insatisfacaoDetectada?: boolean;
  /** Quantas vezes a Nina já esclareceu nesta conversa. */
  tentativasEsclarecimento?: number;
  /**
   * FASE 4 — uma exceção PUBLICADA aplicável rege este turno (ex.: verificação
   * de homologação). A intenção "ambígua" da entrada não pode transformar uma
   * resposta correta em CLARIFY. As proteções continuam antes desta regra:
   * pedido humano, insatisfação, ação crítica bloqueada e fonte ausente.
   */
  excecaoPublicadaAplicavel?: boolean;
  politica?: PoliticaRecuperacao;
};

export type PlanoDeHandoff = {
  decision: DecisaoDeHandoff;
  reason: MotivoDecisaoHandoff;
  /** A situação podia ser resolvida pela própria Nina neste turno? */
  recuperavel: boolean;
  /** Ação crítica bloqueada que ainda pede uma pergunta ao paciente. */
  clarify: boolean;
  /** Frase curta e auditável do porquê. */
  explicacao: string;
};

/** Bloqueios que uma pergunta ao paciente NÃO resolve. */
const BLOQUEIOS_SEM_FONTE = new Set([
  "MISSING_REQUIRED_OFFICIAL_SOURCE",
  "STALE_OFFICIAL_SOURCE",
  "INTERNAL_NOTE_AS_SOURCE",
  "SOURCE_CONFLICT",
  "UNGROUNDED_CLAIM",
]);

/** Bloqueios que se resolvem quando o paciente informa/escolhe algo. */
const BLOQUEIOS_RECUPERAVEIS = new Set([
  "AMBIGUOUS_CRITICAL_ENTITY",
  "INVALID_PATIENT_DATA",
  "INCONSISTENT_SCHEDULE",
]);

function faltaDadoDoPaciente(r: ResultadoConfianca): boolean {
  if ((r.evidence?.camposFaltantes ?? []).length > 0) return true;
  return (r.validators ?? []).some(
    (v) =>
      (v.validator === "RequiredDataValidator" ||
        v.validator === "EntityResolutionValidator" ||
        v.validator === "IntentClarityValidator") &&
      v.status !== "PASS" &&
      v.status !== "NOT_APPLICABLE",
  );
}

/**
 * A Nina consegue destravar sozinha perguntando UMA coisa ao paciente?
 * Falta de fonte oficial nunca é recuperável por pergunta: o dado não existe
 * publicado, e inventar está fora de questão.
 */
export function situacaoRecuperavel(
  r: ResultadoConfianca,
  tipoTurno?: TipoTurno | null,
): boolean {
  const bloqueios = (r.hardBlockers ?? []).map(String);
  if (bloqueios.some((b) => BLOQUEIOS_SEM_FONTE.has(b))) return false;
  if (bloqueios.some((b) => BLOQUEIOS_RECUPERAVEIS.has(b))) return true;
  if (bloqueios.length > 0) return false;
  // Um turno de esclarecimento é, por definição, falta de contexto do
  // paciente: "quero uma informação" se resolve perguntando o quê.
  if (tipoTurno === "ESCLARECIMENTO" || tipoTurno === "SAUDACAO") return true;
  return faltaDadoDoPaciente(r);
}

/**
 * Decide o destino do turno. A ordem importa: pedido explícito e insatisfação
 * vêm antes de qualquer conta de confiança; saudação nunca vira handoff só
 * por não ter intenção operacional.
 */
export function decidirHandoff(e: EntradaDecisaoHandoff): PlanoDeHandoff {
  const politica = e.politica ?? POLITICA_RECUPERACAO_PADRAO;
  const r = e.avaliacaoAcao;
  const tentativas = e.tentativasEsclarecimento ?? 0;
  const esgotou = tentativas >= politica.maxTentativasEsclarecimento;
  const bloqueios = (r.hardBlockers ?? []).map(String);
  const recuperavel = situacaoRecuperavel(r, e.tipoTurno);
  const acaoBloqueada = r.actionSafety?.status === "BLOCKED";

  // CATEGORIA 5 — pedido explícito por humano: regra própria, não depende
  // de confiança nenhuma.
  if (e.pedidoHumanoExplicito === true || e.tipoTurno === "HANDOFF") {
    return {
      decision: "HANDOFF",
      reason: "EXPLICIT_HUMAN_REQUEST",
      recuperavel: false,
      clarify: false,
      explicacao: "o paciente pediu para falar com uma pessoa",
    };
  }

  // CATEGORIA 6 — insatisfação: preserva a regra já configurada, sem ampliar.
  if (e.insatisfacaoDetectada === true) {
    return {
      decision: "HANDOFF",
      reason: "PATIENT_DISSATISFACTION",
      recuperavel: false,
      clarify: false,
      explicacao: "sinal de insatisfação tratado pela regra existente",
    };
  }

  // CATEGORIA 4 — ação crítica bloqueada: nunca executa. Só vira handoff
  // quando nem perguntar resolve.
  if (acaoBloqueada) {
    if (recuperavel && !esgotou) {
      return {
        decision: "BLOCK_ACTION",
        reason: "CRITICAL_ACTION_BLOCKED",
        recuperavel: true,
        clarify: true,
        explicacao: "ação suspensa; falta um dado que o paciente pode informar",
      };
    }
    return {
      decision: "HANDOFF",
      reason: esgotou ? "REPEATED_CLARIFICATION_FAILURE" : "CRITICAL_ACTION_BLOCKED",
      recuperavel: false,
      clarify: false,
      explicacao: "ação crítica sem caminho seguro automático",
    };
  }

  // CATEGORIA 3 — fonte obrigatória ausente: a Nina não pode inventar e
  // perguntar não cria a informação.
  if (bloqueios.some((b) => BLOQUEIOS_SEM_FONTE.has(b))) {
    return {
      decision: "HANDOFF",
      reason: "MISSING_REQUIRED_SOURCE",
      recuperavel: false,
      clarify: false,
      explicacao: "informação exige fonte oficial que não foi encontrada",
    };
  }

  // CATEGORIA 2 — saudação continua com a Nina. Ausência de intenção
  // operacional nunca é, sozinha, motivo de transferência.
  if (e.tipoTurno === "SAUDACAO" && bloqueios.length === 0) {
    return {
      decision: "CONTINUE",
      reason: "GREETING",
      recuperavel: true,
      clarify: false,
      explicacao: "saudação: nada a verificar e nada a transferir",
    };
  }

  // Limite de tentativas: evita o loop infinito de "não entendi".
  if (esgotou && e.decisaoEfetiva !== "ALLOW") {
    return {
      decision: "HANDOFF",
      reason: "REPEATED_CLARIFICATION_FAILURE",
      recuperavel: false,
      clarify: false,
      explicacao: `esclarecimento tentado ${tentativas}x sem avançar`,
    };
  }

  // FASE 4 — exceção publicada aplicável rege este turno: a entrada pode
  // parecer ambígua, mas a resposta correta já foi definida pela exceção.
  // Chega aqui só depois das proteções (pedido humano, insatisfação, ação
  // crítica bloqueada e fonte oficial ausente), que continuam vencendo.
  if (e.excecaoPublicadaAplicavel) {
    return {
      decision: "CONTINUE",
      reason: "PUBLISHED_EXCEPTION",
      recuperavel: true,
      clarify: false,
      explicacao: "exceção publicada aplicável a este turno dispensa esclarecimento",
    };
  }

  // CATEGORIA 1 — falta contexto do paciente: resolve-se perguntando.
  if (e.decisaoEfetiva === "CLARIFY" || (e.decisaoEfetiva !== "ALLOW" && recuperavel)) {
    return {
      decision: "CLARIFY",
      reason: "MISSING_PATIENT_CONTEXT",
      recuperavel: true,
      clarify: true,
      explicacao: "falta um dado do paciente; uma pergunta resolve",
    };
  }

  // Restou incerteza sem caminho de recuperação: aí sim vai para humano.
  if (e.decisaoEfetiva === "HANDOFF" || e.decisaoEfetiva === "BLOCK_ACTION") {
    return {
      decision: "HANDOFF",
      reason: "LOW_CONFIDENCE_UNRECOVERABLE",
      recuperavel: false,
      clarify: false,
      explicacao: "confiança insuficiente e sem recuperação possível",
    };
  }

  return {
    decision: "CONTINUE",
    reason: "ANSWER_ALLOWED",
    recuperavel: true,
    clarify: false,
    explicacao: "resposta liberada pelo motor",
  };
}
