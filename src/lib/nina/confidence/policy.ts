/**
 * POLÍTICA CENTRAL DE CONFIANÇA (Fase 3).
 *
 * Um único lugar define: pesos de cada validador, faixas de decisão,
 * penalidades das verificações graduais, exigência por risco de ação e a
 * lista de bloqueadores absolutos. Nada disso pode ficar espalhado em número
 * solto pelo código — ajustar a política é editar este arquivo (ou passar uma
 * política customizada para o motor).
 *
 * Regra central: a decisão NÃO é só a pontuação. Um bloqueador absoluto
 * derruba a resposta mesmo com score 92.
 *
 * Os valores abaixo são a configuração de partida e devem ser recalibrados
 * quando houver dados reais da Nina.
 */
import type {
  Bloqueador,
  DecisaoMotor,
  NivelConfianca,
  NivelRiscoAcao,
  ResultadoValidador,
} from "./types";

/** Códigos canônicos de bloqueio absoluto (independentes de fornecedor). */
export type HardBlocker =
  | "SOURCE_CONFLICT"
  | "TOOL_FAILURE_ON_CRITICAL_ACTION"
  | "INVALID_BUSINESS_RULE"
  | "MISSING_REQUIRED_OFFICIAL_SOURCE"
  | "AMBIGUOUS_CRITICAL_ENTITY"
  | "INCONSISTENT_SCHEDULE"
  | "INVALID_PATIENT_DATA"
  | "UNSAFE_ACTION"
  | "STALE_OFFICIAL_SOURCE"
  | "INTERNAL_NOTE_AS_SOURCE";

export type PoliticaConfianca = {
  /** Peso de cada validador na pontuação 0–100. Soma dos ativos = 100. */
  pesos: Record<string, number>;
  /** Faixas de decisão por pontuação. */
  limites: { HIGH: number; MEDIUM: number };
  /** Penalidade das verificações graduais (não bloqueiam, descontam). */
  penalidades: Record<string, number>;
  /** Confiança mínima exigida conforme o risco da ação. */
  minimoPorRisco: Record<NivelRiscoAcao, number>;
  /** Bloqueador interno -> código canônico de bloqueio absoluto. */
  bloqueadoresAbsolutos: Record<string, HardBlocker>;
  /** Ações que gravam algo de verdade: bloqueio nelas vira BLOCK_ACTION. */
  acoesDeEscrita: string[];
};

/**
 * Versão da política de confiança. Sobe sempre que pesos, faixas, penalidades,
 * mínimos por risco ou bloqueadores absolutos mudarem. Fica gravada junto de
 * cada decisão, para que uma avaliação antiga continue lida com a régua da
 * época — nunca com a régua de hoje.
 */
export const VERSAO_POLITICA = "v1";

export const POLITICA_PADRAO: PoliticaConfianca = {
  pesos: {
    IntentClarityValidator: 15,
    EntityResolutionValidator: 10,
    RequiredDataValidator: 10,
    OfficialSourceValidator: 20,
    SourceFreshnessValidator: 10,
    ToolIntegrityValidator: 15,
    ConflictValidator: 10,
    BusinessRulesValidator: 10,
    // ActionRisk não pontua: ele endurece o mínimo exigido.
    ActionRiskValidator: 0,
  },
  limites: { HIGH: 90, MEDIUM: 75 },
  penalidades: {
    consulta_realizada: 45,
    paciente_identificado: 20,
    foco_da_resposta: 15,
    resposta_nao_vazia: 60,
  },
  minimoPorRisco: { LOW: 50, MEDIUM: 60, HIGH: 80, CRITICAL: 90 },
  bloqueadoresAbsolutos: {
    CONFLITO_DE_FONTE: "SOURCE_CONFLICT",
    FERRAMENTA_FALHOU: "TOOL_FAILURE_ON_CRITICAL_ACTION",
    REGRA_DE_NEGOCIO_NAO_ATENDIDA: "INVALID_BUSINESS_RULE",
    REGRA_EXIGE_HUMANO: "UNSAFE_ACTION",
    VALOR_SEM_CATALOGO: "MISSING_REQUIRED_OFFICIAL_SOURCE",
    PREPARO_SEM_FONTE: "MISSING_REQUIRED_OFFICIAL_SOURCE",
    AGENDA_SEM_CONFIRMACAO: "INCONSISTENT_SCHEDULE",
    CAMPO_OBRIGATORIO_AUSENTE: "INVALID_PATIENT_DATA",
    FONTE_NAO_VIGENTE: "STALE_OFFICIAL_SOURCE",
    NOTA_INTERNA_COMO_FONTE: "INTERNAL_NOTE_AS_SOURCE",
  },
  acoesDeEscrita: ["criar_agendamento", "cancelar_agendamento"],
};

/** Pontuação ponderada dos validadores (0–100). NOT_APPLICABLE sai da conta. */
export function pontuarValidadores(
  validators: ResultadoValidador[],
  politica: PoliticaConfianca = POLITICA_PADRAO,
): number {
  let total = 0;
  let obtido = 0;
  for (const v of validators) {
    const peso = politica.pesos[v.validator] ?? 0;
    if (peso <= 0 || v.status === "NOT_APPLICABLE") continue;
    total += peso;
    const parcial = v.status === "BLOCK" ? 0 : Math.max(0, Math.min(100, v.score));
    obtido += (peso * parcial) / 100;
  }
  if (total === 0) return 100;
  return Math.round((obtido / total) * 100);
}

/**
 * Bloqueadores absolutos: os declarados pelos validadores/verificações mais os
 * derivados do risco da ação (ambiguidade crítica, falha de ferramenta em ação
 * crítica).
 */
export function detectarHardBlockers(
  entrada: {
    bloqueadores: Bloqueador[];
    validators?: ResultadoValidador[];
    risco: NivelRiscoAcao;
  },
  politica: PoliticaConfianca = POLITICA_PADRAO,
): HardBlocker[] {
  const out = new Set<HardBlocker>();
  for (const b of entrada.bloqueadores) {
    const canonico = politica.bloqueadoresAbsolutos[b];
    if (canonico) out.add(canonico);
  }
  const critico = entrada.risco === "HIGH" || entrada.risco === "CRITICAL";
  for (const v of entrada.validators ?? []) {
    if (v.status === "PASS" || v.status === "NOT_APPLICABLE") continue;
    if (v.validator === "EntityResolutionValidator" && critico) out.add("AMBIGUOUS_CRITICAL_ENTITY");
    if (v.validator === "ToolIntegrityValidator" && critico) out.add("TOOL_FAILURE_ON_CRITICAL_ACTION");
  }
  return [...out];
}

export function nivelDaPontuacao(
  score: number,
  politica: PoliticaConfianca = POLITICA_PADRAO,
): NivelConfianca {
  if (score >= politica.limites.HIGH) return "HIGH";
  if (score >= politica.limites.MEDIUM) return "MEDIUM";
  return "LOW";
}

export type EntradaPolitica = {
  /** Pontuação ponderada dos validadores (0–100). */
  scoreValidadores: number;
  /** Desconto das verificações graduais. */
  penalidade: number;
  bloqueadores: Bloqueador[];
  hardBlockers: HardBlocker[];
  risco: NivelRiscoAcao;
  acao: string;
  /** A rodada de esclarecimento já foi gasta neste turno. */
  esclarecimentoUsado: boolean;
  /**
   * As únicas reprovações são de ambiguidade (intenção/entidade), sem
   * bloqueador, falha de ferramenta ou fonte ausente. Ambiguidade se resolve
   * perguntando ao paciente — não transferindo.
   */
  ambiguidadeResolvivel?: boolean;
};

export type SaidaPolitica = {
  score: number;
  level: NivelConfianca;
  decision: DecisaoMotor;
};

/**
 * Aplica a política: primeiro bloqueadores, depois faixa de pontuação.
 * MEDIUM pede esclarecimento uma única vez — depois da resposta do paciente o
 * runtime roda o motor inteiro de novo, nunca reaproveita a pontuação.
 */
export function aplicarPolitica(
  e: EntradaPolitica,
  politica: PoliticaConfianca = POLITICA_PADRAO,
): SaidaPolitica {
  const bloqueado = e.bloqueadores.length > 0 || e.hardBlockers.length > 0;
  const score = bloqueado
    ? 0
    : Math.max(0, Math.min(100, Math.round(e.scoreValidadores - e.penalidade)));
  const level = nivelDaPontuacao(score, politica);

  if (bloqueado) {
    return {
      score,
      level,
      decision: politica.acoesDeEscrita.includes(e.acao) ? "BLOCK_ACTION" : "HANDOFF",
    };
  }

  const minimo = politica.minimoPorRisco[e.risco];
  let decision: DecisaoMotor;
  if (level === "HIGH" && score >= minimo) decision = "ALLOW";
  else if (level === "LOW")
    decision = e.ambiguidadeResolvivel === true && !e.esclarecimentoUsado ? "CLARIFY" : "HANDOFF";
  else decision = e.esclarecimentoUsado ? "HANDOFF" : "CLARIFY";

  return { score, level, decision };
}
