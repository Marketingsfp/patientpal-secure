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
import { contaContraANota } from "./types";
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
  | "INTERNAL_NOTE_AS_SOURCE"
  // FASE 4 — coerência de processo e prova de ações.
  | "WORKFLOW_STATE_MISMATCH"
  | "REQUIRED_TOOL_NOT_CALLED"
  | "UNSUPPORTED_OPERATIONAL_CLAIM"
  // FASE 5 — afirmação isolada da resposta final sem fonte.
  | "UNGROUNDED_CLAIM";

/**
 * FASE 3 — teto de confiança por cobertura de evidência.
 * Todos os números vivem AQUI, versionados, para calibração posterior.
 * Nenhum deles pode ser reescrito espalhado pelo motor.
 */
export type PoliticaCobertura = {
  /** Abaixo desta cobertura (%) a resposta não pode ser HIGH. */
  minimaParaHigh: number;
  /** Abaixo desta cobertura (%) a resposta não pode ser ALLOW. */
  minimaParaAllow: number;
  /** Teto da nota final quando a cobertura fica abaixo de `minimaParaHigh`. */
  tetoScoreCoberturaBaixa: number;
  /** Dimensões que, desconhecidas, impedem HIGH. */
  dimensoesCriticas: string[];
  /** Fontes obrigatórias que, desconhecidas, forçam handoff/bloqueio. */
  fontesObrigatorias: string[];
};

export type PoliticaConfianca = {
  /**
   * Peso de cada validador. Os pesos são RELATIVOS: a nota é normalizada pelo
   * peso das dimensões efetivamente avaliadas, então a soma não precisa ser
   * exatamente 100 (ver `medirEvidencia`).
   */
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
  /**
   * FASE 2 — dimensões que respondem "é seguro EXECUTAR a ação?" e NÃO
   * "posso confiar no texto?". Elas continuam valendo integralmente para
   * `action_safety`; na avaliação da MENSAGEM elas não pontuam nem bloqueiam.
   */
  validadoresDeAcao: string[];
  /** Tetos por cobertura de evidência (Fase 3). */
  cobertura: PoliticaCobertura;
};

/**
 * Versão da política de confiança. Sobe sempre que pesos, faixas, penalidades,
 * mínimos por risco, bloqueadores absolutos ou a INTERPRETAÇÃO do score
 * mudarem. Fica gravada junto de cada decisão, para que uma avaliação antiga
 * continue lida com a régua da época — nunca com a régua de hoje.
 *
 * v1 -> v2 (Fase 3): mudança material de significado.
 *  - `NOT_APPLICABLE` (dimensão dispensável) passou a ser distinguido de
 *    `UNKNOWN` (dimensão relevante sem evidência);
 *  - nenhuma evidência avaliável deixou de valer 100 e passou a valer 0 com
 *    `confidenceInsufficient`;
 *  - passou a existir `evidence_coverage` e tetos de nota por cobertura.
 * v2 -> v3 (Fase 4): entrou o `WorkflowConsistencyValidator` (peso 15,
 * dimensão crítica de cobertura) e três bloqueadores canônicos novos:
 * `WORKFLOW_STATE_MISMATCH`, `REQUIRED_TOOL_NOT_CALLED` e
 * `UNSUPPORTED_OPERATIONAL_CLAIM`.
 * v3 -> v4 (Fase 5): a avaliação passou a distinguir `action_safety` de
 * `answer_confidence` (esta última medida sobre o TEXTO FINAL já
 * pós-processado); entrou o `ClaimGroundingValidator` (peso 20, dimensão
 * crítica) com o bloqueador `UNGROUNDED_CLAIM`; e foi REMOVIDA a penalidade
 * `foco_da_resposta` — quantidade de fatos deixou de reduzir a confiança.
 * Snapshots gravados com "v1"/"v2"/"v3" continuam válidos sob a régua da época.
 */
/*
 * v4 -> v5 (Fase 2 answer/action): `action_safety` e `answer_confidence`
 * passaram a ser realmente independentes. Entrou o status `PENDING` (dado que
 * ainda será coletado antes da ação — não desconta nota nem cobertura) e as
 * dimensões de PRÉ-CONDIÇÃO DA AÇÃO (`validadoresDeAcao`) deixaram de pontuar
 * e de bloquear a avaliação da mensagem. Nenhum limite crítico foi reduzido.
 */
export const VERSAO_POLITICA = "v5";
/**
 * Versão do motor gravada junto com cada avaliação.
 * FASE 7 — "Confidence Engine v2": motor com cobertura de evidências,
 * coerência de workflow, grounding por afirmação e verificação da resposta
 * final. Snapshots gravados por versões anteriores continuam legíveis: eles
 * são apenas lidos sob a régua da época (ver `ehVersaoMotorHistorica`).
 */
export const VERSAO_MOTOR = "confidence-v2";

/** Versões antigas do motor que continuam válidas apenas para leitura. */
export const VERSOES_MOTOR_HISTORICAS = ["engine-v6"] as const;

export function ehVersaoMotorHistorica(versao: string | null | undefined): boolean {
  const v = (versao ?? "").trim();
  return v !== VERSAO_MOTOR;
}

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
    // FASE 4 — coerência do processo pesa como fonte oficial: é ela que
    // separa "resposta bonita" de "resposta com caminho verificado".
    WorkflowConsistencyValidator: 15,
    // FASE 5 — grounding por afirmação: é o que impede uma frase verdadeira
    // de "carregar" outra sem fonte na mesma mensagem.
    ClaimGroundingValidator: 20,
    // ActionRisk não pontua: ele endurece o mínimo exigido.
    ActionRiskValidator: 0,
  },
  limites: { HIGH: 90, MEDIUM: 75 },
  penalidades: {
    consulta_realizada: 45,
    paciente_identificado: 20,
    // FASE 5 — `foco_da_resposta` foi REMOVIDA de propósito: dar valor,
    // profissional, data, horário e unidade na mesma resposta é a regra da
    // Nina, não um defeito. Fato sem fonte é medido pelo grounding.
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
    PACIENTE_NAO_IDENTIFICADO: "INVALID_PATIENT_DATA",
    WORKFLOW_INCONSISTENTE: "WORKFLOW_STATE_MISMATCH",
    FERRAMENTA_OBRIGATORIA_NAO_CHAMADA: "REQUIRED_TOOL_NOT_CALLED",
    AFIRMACAO_OPERACIONAL_SEM_PROVA: "UNSUPPORTED_OPERATIONAL_CLAIM",
    AFIRMACAO_SEM_EVIDENCIA: "UNGROUNDED_CLAIM",
  },
  acoesDeEscrita: ["criar_agendamento", "cancelar_agendamento"],
  // Pré-condições da EXECUÇÃO (dados do paciente, regras da clínica para
  // agendar). Elas não dizem nada sobre a veracidade do texto.
  validadoresDeAcao: ["RequiredDataValidator", "BusinessRulesValidator"],
  cobertura: {
    // Valores de partida da Fase 3 — versionados aqui para calibração futura.
    minimaParaHigh: 70,
    minimaParaAllow: 50,
    tetoScoreCoberturaBaixa: 74,
    dimensoesCriticas: [
      "OfficialSourceValidator",
      "ToolIntegrityValidator",
      "RequiredDataValidator",
      "IntentClarityValidator",
      "WorkflowConsistencyValidator",
      "ClaimGroundingValidator",
    ],
    fontesObrigatorias: ["OfficialSourceValidator"],
  },
};

/**
 * FASE 3 — medida de cobertura das evidências.
 *
 * `score` responde "quão bem foram os sinais que eu consegui olhar".
 * `cobertura` responde "quanto do que importava eu consegui olhar".
 * As duas coisas são reportadas separadamente e nunca se disfarçam uma na outra.
 */
export type MedidaDeEvidencia = {
  /** Nota ponderada apenas entre as dimensões efetivamente avaliadas (0–100). */
  score: number;
  /** Cobertura das evidências (0–100). */
  cobertura: number;
  /** Dimensões relevantes que ficaram sem evidência avaliável. */
  desconhecidas: string[];
  /** Dimensões dispensadas legitimamente neste tipo de resposta. */
  naoAplicaveis: string[];
  /** FASE 2 — dimensões que ainda serão satisfeitas antes da ação. */
  pendentes: string[];
  /** Nada relevante pôde ser avaliado: confiança insuficiente, não 100. */
  semEvidencia: boolean;
};

/**
 * Pontua e mede cobertura na mesma passada.
 *
 * - `NOT_APPLICABLE` sai da nota E da cobertura (a dimensão não era necessária).
 * - `UNKNOWN` sai da nota mas ENTRA na cobertura como não coberta — é
 *   exatamente o caso em que antes o silêncio virava certeza.
 * - Sem nenhuma dimensão avaliável, a nota é 0 com `semEvidencia`, nunca 100.
 */
export function medirEvidencia(
  validators: ResultadoValidador[],
  politica: PoliticaConfianca = POLITICA_PADRAO,
): MedidaDeEvidencia {
  let pesoAvaliado = 0;
  let pesoRelevante = 0;
  let obtido = 0;
  const desconhecidas: string[] = [];
  const naoAplicaveis: string[] = [];
  const pendentes: string[] = [];

  for (const v of validators) {
    const peso = politica.pesos[v.validator] ?? 0;
    if (v.status === "NOT_APPLICABLE") {
      naoAplicaveis.push(v.validator);
      continue;
    }
    // FASE 2 — dado que ainda será coletado antes da ação é o curso normal da
    // conversa: não pontua contra a mensagem nem derruba a cobertura.
    if (v.status === "PENDING") {
      pendentes.push(v.validator);
      continue;
    }
    if (v.status === "UNKNOWN") {
      desconhecidas.push(v.validator);
      if (peso > 0) pesoRelevante += peso;
      continue;
    }
    if (peso <= 0) continue;
    pesoRelevante += peso;
    pesoAvaliado += peso;
    const parcial = v.status === "BLOCK" ? 0 : Math.max(0, Math.min(100, v.score));
    obtido += (peso * parcial) / 100;
  }

  const semEvidencia = pesoAvaliado === 0;
  return {
    // FASE 3: removido o antigo `if (total === 0) return 100`.
    score: semEvidencia ? 0 : Math.round((obtido / pesoAvaliado) * 100),
    cobertura: pesoRelevante === 0 ? 0 : Math.round((pesoAvaliado / pesoRelevante) * 100),
    desconhecidas,
    naoAplicaveis,
    pendentes,
    semEvidencia,
  };
}

/** Compatibilidade: apenas a nota das dimensões avaliadas. */
export function pontuarValidadores(
  validators: ResultadoValidador[],
  politica: PoliticaConfianca = POLITICA_PADRAO,
): number {
  return medirEvidencia(validators, politica).score;
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
    // UNKNOWN não é falha comprovada: limita a decisão pela cobertura,
    // não inventa um bloqueio absoluto que não foi observado.
    if (!contaContraANota(v.status)) continue;
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
  /** FASE 3 — cobertura das evidências (0–100). Ausente = 100 (compat.). */
  cobertura?: number;
  /** FASE 3 — nada relevante pôde ser avaliado neste turno. */
  semEvidencia?: boolean;
  /** FASE 3 — dimensões relevantes que ficaram UNKNOWN. */
  dimensoesDesconhecidas?: string[];
};

export type SaidaPolitica = {
  score: number;
  level: NivelConfianca;
  decision: DecisaoMotor;
  /** Tetos de cobertura aplicados nesta decisão (auditável). */
  limitacoes: string[];
};

/**
 * Aplica a política: primeiro bloqueadores, depois tetos de cobertura, depois
 * faixa de pontuação. MEDIUM pede esclarecimento uma única vez — depois da
 * resposta do paciente o runtime roda o motor inteiro de novo.
 */
export function aplicarPolitica(
  e: EntradaPolitica,
  politica: PoliticaConfianca = POLITICA_PADRAO,
): SaidaPolitica {
  const bloqueado = e.bloqueadores.length > 0 || e.hardBlockers.length > 0;
  const bruto = bloqueado
    ? 0
    : Math.max(0, Math.min(100, Math.round(e.scoreValidadores - e.penalidade)));

  if (bloqueado) {
    return {
      score: 0,
      level: nivelDaPontuacao(0, politica),
      decision: politica.acoesDeEscrita.includes(e.acao) ? "BLOCK_ACTION" : "HANDOFF",
      limitacoes: [],
    };
  }

  // ---------------- FASE 3: tetos por cobertura de evidência ----------------
  const cfg = politica.cobertura;
  const cobertura = e.cobertura ?? 100;
  const desconhecidas = e.dimensoesDesconhecidas ?? [];
  const limitacoes: string[] = [];
  let score = bruto;
  let permitidoAllow = true;

  // (1) Nenhuma dimensão relevante avaliável: confiança insuficiente.
  if (e.semEvidencia === true) {
    score = 0;
    permitidoAllow = false;
    limitacoes.push("CONFIDENCE_INSUFFICIENT");
  }

  // (2) Cobertura baixa limita a nota final — sinal conhecido bom não vale
  //     por um quadro que não foi visto.
  if (cobertura < cfg.minimaParaHigh) {
    score = Math.min(score, cfg.tetoScoreCoberturaBaixa);
    limitacoes.push("LOW_EVIDENCE_COVERAGE");
  }
  if (cobertura < cfg.minimaParaAllow) {
    permitidoAllow = false;
    limitacoes.push("COVERAGE_BELOW_ALLOW");
  }

  // (3) Dimensão crítica desconhecida nunca pode ser HIGH.
  const criticasDesconhecidas = desconhecidas.filter((d) => cfg.dimensoesCriticas.includes(d));
  if (criticasDesconhecidas.length > 0) {
    score = Math.min(score, politica.limites.HIGH - 1);
    limitacoes.push("CRITICAL_DIMENSION_UNKNOWN");
  }

  // (4) Fonte obrigatória desconhecida: não se responde no escuro.
  const fontesDesconhecidas = desconhecidas.filter((d) => cfg.fontesObrigatorias.includes(d));
  if (fontesDesconhecidas.length > 0) {
    permitidoAllow = false;
    limitacoes.push("REQUIRED_SOURCE_UNKNOWN");
    if (politica.acoesDeEscrita.includes(e.acao)) {
      return {
        score: Math.min(score, politica.limites.HIGH - 1),
        level: nivelDaPontuacao(Math.min(score, politica.limites.HIGH - 1), politica),
        decision: "BLOCK_ACTION",
        limitacoes,
      };
    }
  }

  const level = nivelDaPontuacao(score, politica);
  const minimo = politica.minimoPorRisco[e.risco];
  let decision: DecisaoMotor;
  if (permitidoAllow && level === "HIGH" && score >= minimo) decision = "ALLOW";
  else if (level === "LOW")
    decision = e.ambiguidadeResolvivel === true && !e.esclarecimentoUsado ? "CLARIFY" : "HANDOFF";
  else decision = e.esclarecimentoUsado ? "HANDOFF" : "CLARIFY";


  return { score, level, decision, limitacoes };
}
