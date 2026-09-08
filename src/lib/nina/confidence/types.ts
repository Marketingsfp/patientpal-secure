/**
 * CONTRATO PÚBLICO DO CONFIDENCE DECISION ENGINE (Fase 1).
 *
 * Este contrato é deliberadamente independente de fornecedor: não menciona
 * Gemini, GPT, AI Gateway nem formato de tool call. Quem chama traduz o seu
 * runtime para este contexto; o motor devolve uma decisão. Trocar o modelo da
 * Nina não obriga a reescrever nada aqui.
 *
 * O motor NÃO envia mensagem, NÃO grava no banco e NÃO transfere conversa.
 * Ele apenas decide e explica a decisão.
 */

/** O que a Nina pretende fazer neste turno. */
export type AcaoSolicitada =
  | "responder_informacao"
  | "informar_valor"
  | "informar_horario"
  | "informar_profissional"
  | "informar_disponibilidade"
  | "informar_preparo"
  | "informar_regra"
  | "criar_agendamento"
  | "cancelar_agendamento"
  | "identificar_paciente"
  | "transferir_humano"
  | "desconhecida";

/** Origem de um fato apresentado ao paciente. */
export type TipoFonte =
  | "catalogo_publicado"
  | "agenda"
  | "crm"
  | "atendimento"
  | "instrucoes"
  | "desconhecida";

/** Um documento/registro recuperado para embasar a resposta. */
export type FonteRecuperada = {
  tipo: TipoFonte;
  /** Identificador do registro na origem, quando existir. */
  referencia?: string | null;
  /** A consulta devolveu conteúdo aproveitável (não só "consultei"). */
  temConteudo: boolean;
  /** Publicado/vigente na origem. Rascunho e arquivado não valem. */
  publicado?: boolean;
  /** Registro ativo na origem (false = desativado). */
  ativo?: boolean;
  /** Data de expiração/vigência, quando a origem controlar isso (ISO). */
  expiraEm?: string | null;
  /** Preenchido quando o registro foi substituído por outra versão. */
  substituidoPor?: string | null;
  /** Nota interna: jamais pode ser repassada ao paciente. */
  interna?: boolean;
};

/** Resultado de uma ferramenta executada neste turno. */
export type ResultadoFerramenta = {
  nome: string;
  /** Capacidade normalizada do Tool Broker (searchKnowledgeBase, agenda...). */
  capacidade: string | null;
  fonte: string | null;
  success: boolean;
  erro?: string | null;
  /** Devolveu dado utilizável. */
  temConteudo?: boolean;
};

/** Contexto operacional do atendimento. */
export type ContextoNegocio = {
  clinicaId?: string | null;
  ambiente: "producao" | "homologacao";
  pacienteIdentificado: boolean;
  agendamentoConfirmado: boolean;
  /** A rodada de esclarecimento já foi gasta neste turno. */
  esclarecimentoUsado: boolean;
  /** O próprio modelo já pediu atendimento humano. */
  handoffSolicitado: boolean;
};

/**
 * FASE 4 — ESTADO OPERACIONAL REAL DO TURNO.
 *
 * Espelho, em leitura, da máquina de estados que JÁ existe no atendimento
 * (`EstadoFluxoNina.flow.stage` e `EstadoFluxoNina.appointment`). O motor não
 * cria nem avança estado: ele só compara o que a Nina está dizendo com o que
 * o sistema realmente registrou.
 *
 * Campo ausente = desconhecido. Nunca "não aconteceu".
 */
export type EstadoOperacionalTurno = {
  /** Paciente confirmou que quer agendar (não é a clínica ter agenda). */
  bookingIntentConfirmed?: boolean;
  /** O fluxo de agendamento está de fato em andamento nesta conversa. */
  appointmentFlowActive?: boolean;
  /** Nome, CPF e data de nascimento completos e identificados. */
  patientDataComplete?: boolean;
  /** Existe uma vaga escolhida (início/fim) em negociação. */
  slotSelected?: boolean;
  /** O paciente confirmou a vaga oferecida. */
  finalConfirmationReceived?: boolean;
  /** Houve tentativa real de gravar o agendamento neste turno/conversa. */
  appointmentAttempted?: boolean;
  /** A ferramenta de agendar foi efetivamente chamada. */
  appointmentToolCalled?: boolean;
  /** O agendamento foi gravado e confirmado pelo sistema. */
  appointmentCreated?: boolean;
  /** Prova persistida do agendamento (appointment_id ou equivalente). */
  appointmentId?: string | null;
  /** Etapa corrente da máquina de estados existente. */
  workflowState?: string | null;
};

/** Entrada estruturada do motor. */
export type ContextoConfianca = {
  conversationId?: string | null;
  messageId?: string | null;
  /** Intenção detectada pelo runtime, quando houver. Opcional de propósito. */
  intent?: string | null;
  requestedAction: AcaoSolicitada;
  /** Entidades extraídas (procedimento, convênio, data, unidade...). */
  entities?: Record<string, unknown>;
  retrievedSources: FonteRecuperada[];
  toolResults: ResultadoFerramenta[];
  /** Campos obrigatórios para a ação pretendida. */
  requiredFields?: string[];
  businessContext: ContextoNegocio;
  /** Rascunho da resposta, quando o runtime já tem o texto. */
  draftText?: string | null;
  /** O runtime detectou que o pedido do paciente está ambíguo. */
  intentAmbiguo?: boolean;
  /** Confiança do runtime na intenção detectada (0..1). */
  intentConfidence?: number | null;
  /** Candidatos encontrados por entidade — mais de um = ambiguidade. */
  entityCandidates?: Record<string, string[]>;
  /** Valores divergentes para o mesmo fato, vindos de origens diferentes. */
  conflitos?: ConflitoDeFonte[];
  /** Regras determinísticas da clínica aplicáveis a este turno. */
  regrasNegocio?: RegraNegocio[];
  /** FASE 4 — estado real do fluxo operacional, quando o runtime o conhece. */
  operationalState?: EstadoOperacionalTurno;
};

/** O mesmo campo com valores diferentes em origens diferentes. */
export type ConflitoDeFonte = {
  campo: string;
  valores: { origem: string; valor: string }[];
};

/** Regra determinística da clínica avaliada fora do modelo. */
export type RegraNegocio = {
  id: string;
  descricao?: string | null;
  /** A regra foi atendida pelo contexto atual. */
  satisfeita: boolean;
  /** A regra determina atendimento humano para este caso. */
  exigeHumano?: boolean;
};

export type NivelConfianca = "HIGH" | "MEDIUM" | "LOW";

export type DecisaoMotor = "ALLOW" | "CLARIFY" | "HANDOFF" | "BLOCK_ACTION";

/** Bloqueadores absolutos acordados com a equipe. */
export type Bloqueador =
  | "VALOR_SEM_CATALOGO"
  | "AGENDA_SEM_CONFIRMACAO"
  | "FERRAMENTA_FALHOU"
  | "PREPARO_SEM_FONTE"
  | "CAMPO_OBRIGATORIO_AUSENTE"
  | "CONFLITO_DE_FONTE"
  | "FONTE_NAO_VIGENTE"
  | "NOTA_INTERNA_COMO_FONTE"
  | "REGRA_EXIGE_HUMANO"
  | "REGRA_DE_NEGOCIO_NAO_ATENDIDA"
  // FASE 4 — coerência do PROCESSO que levou à resposta.
  | "WORKFLOW_INCONSISTENTE"
  | "FERRAMENTA_OBRIGATORIA_NAO_CHAMADA"
  | "AFIRMACAO_OPERACIONAL_SEM_PROVA";

/**
 * Status padronizado de um validador isolado.
 *
 * FASE 3 — a diferença que faltava:
 * - `NOT_APPLICABLE`: esta dimensão realmente NÃO é necessária para este tipo
 *   de resposta (uma saudação não precisa da Agenda). Sai da conta com razão.
 * - `UNKNOWN`: esta dimensão SERIA relevante, mas não há evidência suficiente
 *   para avaliá-la. Sai da nota, mas derruba a COBERTURA — nunca vira PASS.
 */
export type StatusValidador =
  | "PASS"
  | "WARNING"
  | "FAIL"
  | "BLOCK"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

/** Um validador que não passou nem foi dispensado conta contra a nota. */
export function contaContraANota(status: StatusValidador): boolean {
  return status !== "PASS" && status !== "NOT_APPLICABLE" && status !== "UNKNOWN";
}

export type NivelRiscoAcao = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Saída padrão de cada validador da Fase 2. */
export type ResultadoValidador = {
  validator: string;
  status: StatusValidador;
  /** 0..100 — quanto este validador confia na própria dimensão. */
  score: number;
  reasonCode: string;
  evidence: Record<string, unknown>;
  /** Bloqueador absoluto associado, quando status = BLOCK. */
  blocker?: Bloqueador | null;
  /** Peso descontado do score final quando o status não é PASS. */
  peso?: number;
};

/** Resultado de um validador individual (auditável). */
export type Verificacao = {
  id: string;
  descricao: string;
  aprovado: boolean;
  /** Peso descontado do score quando reprovado. */
  peso: number;
  bloqueador?: Bloqueador | null;
  detalhe?: string | null;
};

export type EvidenciaConfianca = {
  categorias: string[];
  fontesUteis: number;
  fontesPublicadas: number;
  ferramentasExecutadas: number;
  ferramentasComFalha: number;
  camposFaltantes: string[];
  motivos: string[];
};

/** Saída estruturada do motor. */
export type ResultadoConfianca = {
  score: number;
  /**
   * FASE 3 — 0..100. Quanto das dimensões RELEVANTES deste turno pôde de fato
   * ser avaliada. `score` fala dos sinais conhecidos; `evidenceCoverage` diz
   * quanto do quadro conhecemos. Score 96 com cobertura 38 não é "96% seguro".
   */
  evidenceCoverage: number;
  /** Dimensões relevantes que ficaram UNKNOWN neste turno. */
  unknownDimensions: string[];
  /** Nenhuma dimensão relevante pôde ser avaliada (antes isso virava 100). */
  confidenceInsufficient: boolean;
  level: NivelConfianca;
  decision: DecisaoMotor;
  blockers: Bloqueador[];
  /** Bloqueadores absolutos em código canônico (policy.ts). */
  hardBlockers?: string[];
  checks: Verificacao[];
  /** Resultado bruto de cada validador da Fase 2 (auditoria e painel). */
  validators?: ResultadoValidador[];
  evidence: EvidenciaConfianca;
};
