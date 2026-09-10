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
  /**
   * Turno apenas conversacional: existe intenção legível, mas NENHUMA ação
   * executável está prestes a acontecer (ex.: "quero agendar" enquanto a
   * conversa ainda coleta dados). Diferente de "desconhecida", que é ausência
   * de sinal.
   */
  | "nenhuma"
  | "desconhecida";

/**
 * FASE 2 — ações que o sistema realmente EXECUTA (efeito no mundo real).
 * Só elas passam pela avaliação de segurança da ação. Informar preço,
 * conversar ou coletar dados não é ação executável.
 */
export const ACOES_EXECUTAVEIS: AcaoSolicitada[] = [
  "criar_agendamento",
  "cancelar_agendamento",
  "transferir_humano",
];

/**
 * Existe uma ação executável prestes a acontecer neste turno?
 * `null` = o turno legitimamente não tem ação (saudação/esclarecimento).
 */
export function acaoExecutavel(acao: AcaoSolicitada | null): boolean {
  return acao !== null && ACOES_EXECUTAVEIS.includes(acao);
}

/** Normaliza a ação para uso interno: ausência de ação vira `nenhuma`. */
export function acaoOuNenhuma(acao: AcaoSolicitada | null | undefined): AcaoSolicitada {
  return acao ?? "nenhuma";
}

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

/**
 * FASE 5 — tipo de afirmação verificável dentro de UMA resposta.
 * Uma resposta pode conter vários claims independentes; cada um precisa de
 * fonte própria (ver `claims.ts`).
 */
export type TipoClaim =
  | "valor"
  | "profissional"
  | "disponibilidade"
  | "preparo"
  | "regra"
  | "agendamento"
  // FASE 2 — cobertura de serviço, local, convênio, restrição e escala.
  | "servico"
  | "endereco"
  | "unidade"
  | "convenio"
  | "restricao"
  | "escala";

/**
 * FASE 2 — como a frase se relaciona com o fato. Uma recusa prudente
 * ("não tenho o preço confirmado") NÃO é afirmação de preço.
 */
export type ModalidadeClaim = "afirmacao" | "negacao" | "pergunta" | "hipotese";

/**
 * Claim declarado de forma estruturada pelo próprio ciclo do turno (metadata /
 * structured output do modelo atual, quando existir). Nunca é obrigatório: sem
 * ele, a verificação usa contexto e a leitura complementar do texto.
 *
 * FASE 2: claim sugerido pelo modelo NÃO é evidência. O servidor confronta
 * `valor` + `chave` com os fatos recuperados antes de aceitar qualquer um.
 */
export type ClaimEstruturado = {
  id?: string;
  tipo: TipoClaim;
  texto: string;
  fonte?: { tipo: TipoFonte; referencia?: string | null } | null;
  modalidade?: ModalidadeClaim;
  /** Valor afirmado (preço, endereço, horário...). */
  valor?: string | null;
  /** A que caso a afirmação se refere (procedimento, médico, dia, unidade). */
  chave?: import("./evidencia").ChaveFato | null;
};


/**
 * FASE 5 — o que está sendo avaliado.
 *
 * - `action_safety`: é seguro EXECUTAR a ação (agendar, cancelar, transferir)?
 * - `answer_confidence`: a MENSAGEM FINAL que o paciente vai receber é
 *   confiável? É esta que o indicador ao lado da mensagem representa.
 */
export type TipoAvaliacao = "action_safety" | "answer_confidence";

/** Entrada estruturada do motor. */
export type ContextoConfianca = {
  /** FASE 5 — o que esta avaliação responde. Ausente = `action_safety`. */
  tipoAvaliacao?: TipoAvaliacao;
  /** FASE 5 — claims estruturados do turno, quando o runtime os conhece. */
  claims?: ClaimEstruturado[];
  conversationId?: string | null;
  messageId?: string | null;
  /** Intenção detectada pelo runtime, quando houver. Opcional de propósito. */
  intent?: string | null;
  /**
   * FASE 1 (turnType) — `null` significa NENHUMA ação executável neste turno
   * (saudação, esclarecimento). É diferente de `"desconhecida"`, que é o
   * sistema não ter entendido o pedido.
   */
  requestedAction: AcaoSolicitada | null;
  /** FASE 1 (turnType) — natureza do turno; comanda a matriz de exigências. */
  turnType?: import("./turno-tipo").TipoTurno | null;
  /** Entidades extraídas (procedimento, convênio, data, unidade...). */
  entities?: Record<string, unknown>;
  retrievedSources: FonteRecuperada[];
  toolResults: ResultadoFerramenta[];
  /**
   * FASE 2 — fatos concretos extraídos pelo SERVIDOR dos retornos reais das
   * ferramentas. É contra estes fatos que cada afirmação é conferida.
   * Ausente = o turno não propagou evidência (avaliação incompleta, não "ok").
   */
  fatos?: import("./evidencia").FatoRecuperado[];
  /** FASE 2 — estado real de cada consulta do turno, com tentativas/retry. */
  consultas?: import("./evidencia").ConsultaDoTurno[];

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
  | "AFIRMACAO_OPERACIONAL_SEM_PROVA"
  // FASE 5 — afirmação isolada da resposta final sem fonte que a sustente.
  | "AFIRMACAO_SEM_EVIDENCIA";

/**
 * Status padronizado de um validador isolado.
 *
 * FASE 3 — a diferença que faltava:
 * - `NOT_APPLICABLE`: esta dimensão realmente NÃO é necessária para este tipo
 *   de resposta (uma saudação não precisa da Agenda). Sai da conta com razão.
 * - `UNKNOWN`: esta dimensão SERIA relevante, mas não há evidência suficiente
 *   para avaliá-la. Sai da nota, mas derruba a COBERTURA — nunca vira PASS.
 *
 * FASE 2 (answer/action):
 * - `PENDING`: a informação AINDA SERÁ coletada antes da ação (o paciente
 *   nem informou o nome ainda). É o curso normal de uma etapa de coleta:
 *   não é erro da mensagem, não desconta nota e não derruba cobertura.
 */
export type StatusValidador =
  | "PASS"
  | "WARNING"
  | "FAIL"
  | "BLOCK"
  | "PENDING"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

/** Um validador que não passou nem foi dispensado conta contra a nota. */
export function contaContraANota(status: StatusValidador): boolean {
  return (
    status !== "PASS" &&
    status !== "NOT_APPLICABLE" &&
    status !== "UNKNOWN" &&
    status !== "PENDING"
  );
}

/** FASE 2 — resultado da avaliação de SEGURANÇA DA AÇÃO. */
/**
 * FASE 3 — ausência de bloqueador NÃO é autorização. Quando a decisão do motor
 * ainda pede esclarecimento, evidência ou transferência, a ação fica `PENDING`
 * (não é liberada e também não é um bloqueio definitivo).
 */
export type StatusSegurancaAcao = "ALLOWED" | "PENDING" | "BLOCKED" | "NOT_APPLICABLE";

/**
 * "É seguro EXECUTAR esta ação?" — deliberadamente separado de
 * "posso confiar no conteúdo desta mensagem?" (answer_confidence).
 * Sem ação executável no turno o status é `NOT_APPLICABLE`: nunca bloqueio,
 * nunca score 0.
 */
export type AvaliacaoSegurancaAcao = {
  status: StatusSegurancaAcao;
  acao: AcaoSolicitada;
  /** Só existe quando há ação executável. */
  blockers: Bloqueador[];
  hardBlockers: string[];
  motivos: string[];
};

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
  /** FASE 5 — o que foi avaliado: segurança da ação ou a resposta final. */
  tipoAvaliacao: TipoAvaliacao;
  /**
   * FASE 5 — impressão digital do texto avaliado. O score só vale para ESTE
   * texto; se a mensagem mudar depois, a avaliação é invalidada e refeita.
   */
  textoAvaliadoHash: string | null;
  /** FASE 5 — afirmação a afirmação: o que foi verificado e contra qual fonte. */
  claims?: {
    total: number;
    suportados: number;
    semEvidencia: Array<{ tipo: string; trecho: string; motivo: string }>;
  };
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
  /**
   * FASE 2 — segurança da AÇÃO, medida à parte. Um bloqueio aqui NÃO zera a
   * confiança da mensagem: "preciso confirmar seus dados" pode ser uma
   * resposta excelente enquanto a criação do agendamento está bloqueada.
   */
  actionSafety?: AvaliacaoSegurancaAcao;
  /** Dimensões que ainda serão satisfeitas antes da ação (etapa de coleta). */
  pendingDimensions?: string[];
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
