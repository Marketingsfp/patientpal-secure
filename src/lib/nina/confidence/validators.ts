/**
 * VALIDADORES DE CONFIANÇA (Fase 2).
 *
 * Cada validador é uma função pura e independente: recebe o contexto
 * estruturado, devolve { validator, status, score, reasonCode, evidence }.
 * Nenhum deles envia mensagem, grava no banco ou conhece o fornecedor do
 * modelo. O motor apenas orquestra e continua sendo o único a decidir.
 *
 * Robustez: um validador que lançar exceção não derruba o atendimento —
 * `executarValidadoresDeConfianca` isola cada execução e devolve WARNING.
 */
import { acaoExecutavel, acaoOuNenhuma, contaContraANota } from "./types";
import { aplicabilidadeDoTurno } from "./turno-tipo";
import { ClaimGroundingValidator } from "./claims";
import { WorkflowConsistencyValidator } from "./workflow";
import type {
  Bloqueador,
  ContextoConfianca,
  FonteRecuperada,
  NivelRiscoAcao,
  ResultadoFerramenta,
  ResultadoValidador,
  StatusValidador,
} from "./types";

/** Ações que dependem de dado oficial do sistema (não são conversa solta). */
const ACOES_COM_DADO_OFICIAL = new Set([
  "informar_valor",
  "informar_horario",
  "informar_profissional",
  "informar_disponibilidade",
  "informar_preparo",
  "informar_regra",
  "criar_agendamento",
  "cancelar_agendamento",
]);

/** Ações que gravam algo de verdade. */
const ACOES_DE_ESCRITA = new Set(["criar_agendamento", "cancelar_agendamento"]);

// ---------------------------------------------------------------- configuração

export type ConfigValidador = {
  /** Validador ligado. Desligado devolve NOT_APPLICABLE. */
  ativo: boolean;
  /** Peso descontado do score final quando reprovado (0 = só informativo). */
  peso: number;
};

export type ConfigValidadores = Record<string, ConfigValidador>;

export const CONFIG_PADRAO_VALIDADORES: ConfigValidadores = {
  // Peso 0: a pontuação dos validadores é ponderada pela política central
  // (policy.ts). Aqui só fica ligado/desligado por validador.
  IntentClarityValidator: { ativo: true, peso: 0 },
  EntityResolutionValidator: { ativo: true, peso: 0 },
  RequiredDataValidator: { ativo: true, peso: 0 },
  OfficialSourceValidator: { ativo: true, peso: 0 },
  SourceFreshnessValidator: { ativo: true, peso: 0 },
  ToolIntegrityValidator: { ativo: true, peso: 0 },
  ConflictValidator: { ativo: true, peso: 0 },
  BusinessRulesValidator: { ativo: true, peso: 0 },
  ActionRiskValidator: { ativo: true, peso: 0 },
  // FASE 4 — coerência do processo e prova das ações afirmadas.
  WorkflowConsistencyValidator: { ativo: true, peso: 0 },
  // FASE 5 — grounding afirmação a afirmação da resposta final.
  ClaimGroundingValidator: { ativo: true, peso: 0 },
};

/** Confiança mínima exigida conforme o risco da ação. */
export const MINIMO_POR_RISCO: Record<NivelRiscoAcao, number> = {
  LOW: 50,
  MEDIUM: 60,
  HIGH: 80,
  CRITICAL: 90,
};

// ---------------------------------------------------------------- utilidades

const CAP_CATALOGO = new Set(["searchKnowledgeBase", "listCatalog"]);
const CAP_AGENDA = new Set(["checkAvailability", "createAppointment", "listSlots"]);
const CAP_PROFISSIONAL = new Set(["listProfessionals", "getProfessional"]);

/** Categorias que só a clínica pode responder oficialmente. */
const CATEGORIAS_OFICIAIS = new Set([
  "valor",
  "horario",
  "profissional",
  "disponibilidade",
  "preparo",
  "regra",
  "agendamento",
]);

function ferramentaOk(f: ResultadoFerramenta): boolean {
  return f.success && !f.erro;
}

function fonteUtil(f: FonteRecuperada): boolean {
  return f.temConteudo && f.publicado !== false && f.ativo !== false;
}

function res(
  validator: string,
  status: StatusValidador,
  score: number,
  reasonCode: string,
  evidence: Record<string, unknown> = {},
  blocker: Bloqueador | null = null,
): ResultadoValidador {
  return { validator, status, score: Math.max(0, Math.min(100, score)), reasonCode, evidence, blocker };
}

// ---------------------------------------------------------------- 1. intenção

/** O sistema entendeu de fato o que o paciente quer? */
export function IntentClarityValidator(ctx: ContextoConfianca): ResultadoValidador {
  const nome = "IntentClarityValidator";
  const confianca = ctx.intentConfidence ?? null;
  // FASE 1 — saudação e esclarecimento são turnos legítimos sem ação: pedir
  // clareza aqui era o falso negativo do "oi".
  if (ctx.turnType === "SAUDACAO") {
    return res(nome, "PASS", 100, "SAUDACAO", { turnType: ctx.turnType });
  }
  if (ctx.turnType === "ESCLARECIMENTO" && ctx.requestedAction === null) {
    return res(nome, "PASS", 100, "ESCLARECIMENTO_EM_CURSO", { turnType: ctx.turnType });
  }
  const houveConsulta = ctx.toolResults.some(ferramentaOk) || ctx.retrievedSources.some(fonteUtil);

  if (ctx.intentAmbiguo === true) {
    return res(nome, "FAIL", 30, "INTENCAO_AMBIGUA", { intent: ctx.intent ?? null, sinal: "runtime" });
  }
  if (confianca !== null && confianca < 0.5) {
    return res(nome, "FAIL", Math.round(confianca * 100), "INTENCAO_BAIXA_CONFIANCA", { intentConfidence: confianca });
  }
  // FASE 2: ação desconhecida NUNCA sai do denominador. Ter rodado ferramenta
  // não prova que o sistema entendeu o pedido — apenas reduz um pouco o risco.
  if (ctx.requestedAction === "desconhecida") {
    return houveConsulta
      ? res(nome, "WARNING", 55, "ACAO_NAO_DEFINIDA", {
          requestedAction: ctx.requestedAction,
          intent: ctx.intent ?? null,
          houveConsulta: true,
        })
      : res(nome, "FAIL", 40, "ACAO_NAO_DEFINIDA", {
          requestedAction: ctx.requestedAction,
          intent: ctx.intent ?? null,
        });
  }
  if (confianca !== null && confianca < 0.75) {
    return res(nome, "WARNING", Math.round(confianca * 100), "INTENCAO_PARCIAL", { intentConfidence: confianca });
  }
  return res(nome, "PASS", 100, "INTENCAO_CLARA", {
    intent: ctx.intent ?? acaoOuNenhuma(ctx.requestedAction),
  });
}

// ---------------------------------------------------------------- 2. entidade

/** O item pedido foi identificado sem ambiguidade? */
export function EntityResolutionValidator(ctx: ContextoConfianca): ResultadoValidador {
  const nome = "EntityResolutionValidator";
  const acao = acaoOuNenhuma(ctx.requestedAction);
  const candidatos = ctx.entityCandidates ?? {};
  const campos = Object.keys(candidatos);
  if (campos.length === 0) {
    // FASE 3 — numa ação de escrita, "ninguém me disse quais eram os
    // candidatos" não é dispensa: é falta de evidência.
    return ACOES_DE_ESCRITA.has(acao)
      ? res(nome, "UNKNOWN", 0, "CANDIDATOS_NAO_AVALIADOS", { requestedAction: acao })
      : res(nome, "NOT_APPLICABLE", 100, "SEM_CANDIDATOS", {});
  }

  const ambiguos = campos.filter((c) => (candidatos[c] ?? []).length > 1);
  const vazios = campos.filter((c) => (candidatos[c] ?? []).length === 0);

  if (ambiguos.length > 0) {
    return res(
      nome,
      "FAIL",
      30,
      "ENTIDADE_AMBIGUA",
      { ambiguos: ambiguos.map((c) => ({ campo: c, opcoes: candidatos[c] })) },
    );
  }
  if (vazios.length > 0) {
    return res(nome, "WARNING", 50, "ENTIDADE_NAO_ENCONTRADA", { campos: vazios });
  }
  return res(nome, "PASS", 100, "ENTIDADE_RESOLVIDA", { campos });
}

// ---------------------------------------------------------------- 3. dados

/** Existem os dados mínimos para a próxima etapa — e só eles. */
export function RequiredDataValidator(ctx: ContextoConfianca): ResultadoValidador {
  const nome = "RequiredDataValidator";
  const acao = acaoOuNenhuma(ctx.requestedAction);
  const req = ctx.requiredFields ?? [];
  if (req.length === 0) {
    // FASE 3 — agendar/cancelar SEM lista de campos obrigatórios declarada não
    // é "não precisa de dado": é dado não verificado.
    return ACOES_DE_ESCRITA.has(acao)
      ? res(nome, "UNKNOWN", 0, "CAMPOS_OBRIGATORIOS_NAO_DECLARADOS", {
          requestedAction: acao,
        })
      : res(nome, "NOT_APPLICABLE", 100, "SEM_CAMPOS_OBRIGATORIOS", {});
  }

  const e = ctx.entities ?? {};
  const faltantes = req.filter((campo) => {
    const v = e[campo];
    return v === undefined || v === null || String(v).trim() === "";
  });
  if (faltantes.length === 0) return res(nome, "PASS", 100, "DADOS_COMPLETOS", { requiredFields: req });

  const escrita = ACOES_DE_ESCRITA.has(acao);
  if (escrita) {
    return res(
      nome,
      "BLOCK",
      0,
      "CAMPO_OBRIGATORIO_AUSENTE",
      { faltantes, requiredFields: req },
      "CAMPO_OBRIGATORIO_AUSENTE",
    );
  }
  // FASE 2 — sem ação executável no turno, dado faltando é etapa de coleta
  // (PENDING), não erro da resposta. Pedir o dado É a resposta certa.
  if (!acaoExecutavel(ctx.requestedAction)) {
    return res(nome, "PENDING", 0, "DADOS_PENDENTES_DE_COLETA", {
      faltantes,
      requiredFields: req,
      requestedAction: acao,
    });
  }
  return res(nome, "FAIL", 0, "CAMPO_OBRIGATORIO_AUSENTE", { faltantes, requiredFields: req });
}

// ---------------------------------------------------------------- 4. fonte oficial

/** Informação da clínica exige fonte oficial publicada. */
export function OfficialSourceValidator(
  ctx: ContextoConfianca,
  categorias: string[] = [],
): ResultadoValidador {
  const nome = "OfficialSourceValidator";
  const oficiais = categorias.filter((c) => CATEGORIAS_OFICIAIS.has(c));
  if (oficiais.length === 0) {
    // FASE 1 — a matriz central decide se este tipo de turno exige fonte.
    if (!aplicabilidadeDoTurno(ctx.turnType).requiresSource) {
      return res(nome, "NOT_APPLICABLE", 100, "TURNO_NAO_EXIGE_FONTE", {
        turnType: ctx.turnType ?? null,
      });
    }
    // FASE 3 — sem saber o que a Nina vai fazer, não dá para afirmar que este
    // turno dispensa fonte oficial. Saudação dispensa; "desconhecida" não.
    return ctx.requestedAction === "desconhecida"
      ? res(nome, "UNKNOWN", 0, "NECESSIDADE_DE_FONTE_INDETERMINADA", {
          requestedAction: ctx.requestedAction,
        })
      : res(nome, "NOT_APPLICABLE", 100, "SEM_AFIRMACAO_OFICIAL", {});
  }

  const internas = ctx.retrievedSources.filter((s) => s.interna === true && s.temConteudo);
  if (internas.length > 0) {
    return res(
      nome,
      "BLOCK",
      0,
      "NOTA_INTERNA_COMO_FONTE",
      { fontesInternas: internas.map((s) => s.referencia ?? s.tipo) },
      "NOTA_INTERNA_COMO_FONTE",
    );
  }

  const catalogoOk =
    ctx.toolResults.some(
      (f) => f.capacidade !== null && CAP_CATALOGO.has(f.capacidade) && ferramentaOk(f) && f.temConteudo === true,
    ) || ctx.retrievedSources.some((s) => s.tipo === "catalogo_publicado" && fonteUtil(s));
  const agendaOk =
    ctx.toolResults.some(
      (f) =>
        f.capacidade !== null &&
        (CAP_AGENDA.has(f.capacidade) || CAP_PROFISSIONAL.has(f.capacidade)) &&
        ferramentaOk(f),
    ) || ctx.retrievedSources.some((s) => s.tipo === "agenda" && fonteUtil(s));

  // FASE 2 — reserva já persistida é prova de agenda para o horário reservado.
  const reservaPersistida =
    ctx.operationalState?.appointmentCreated === true && Boolean(ctx.operationalState?.appointmentId);

  const precisaAgenda = oficiais.some(
    (c) => c === "horario" || c === "disponibilidade" || c === "profissional" || c === "agendamento",
  );
  const atendido = precisaAgenda ? catalogoOk || agendaOk || reservaPersistida : catalogoOk;

  if (!atendido && somenteNegativasApoiadas(ctx)) {
    // Consulta oficial que respondeu SEM itens sustenta a negativa.
    return res(nome, "PASS", 100, "NEGATIVA_APOIADA_EM_CONSULTA_OFICIAL", { categorias: oficiais });
  }
  if (atendido) {
      return res(nome, "PASS", 100, "FONTE_OFICIAL_PRESENTE", {
      categorias: oficiais,
      catalogoOk,
      agendaOk,
      reservaPersistida,
    });
  }
  }
  const blocker: Bloqueador = oficiais.includes("valor")
    ? "VALOR_SEM_CATALOGO"
    : precisaAgenda
      ? "AGENDA_SEM_CONFIRMACAO"
      : "PREPARO_SEM_FONTE";
  return res(nome, "BLOCK", 0, blocker, { categorias: oficiais, catalogoOk, agendaOk }, blocker);
}

// ---------------------------------------------------------------- 5. atualidade

/** A informação usada corresponde à versão vigente. */
export function SourceFreshnessValidator(
  ctx: ContextoConfianca,
  agora: Date = new Date(),
): ResultadoValidador {
  const nome = "SourceFreshnessValidator";
  const usadas = ctx.retrievedSources.filter((s) => s.temConteudo);
  if (usadas.length === 0) return res(nome, "NOT_APPLICABLE", 100, "SEM_FONTES", {});

  const problemas: { referencia: string; motivo: string }[] = [];
  for (const s of usadas) {
    const ref = s.referencia ?? s.tipo;
    if (s.publicado === false) problemas.push({ referencia: ref, motivo: "nao_publicado" });
    else if (s.ativo === false) problemas.push({ referencia: ref, motivo: "desativado" });
    else if (s.substituidoPor) problemas.push({ referencia: ref, motivo: "substituido" });
    else if (s.expiraEm && new Date(s.expiraEm).getTime() < agora.getTime()) {
      problemas.push({ referencia: ref, motivo: "expirado" });
    }
  }
  if (problemas.length === 0) return res(nome, "PASS", 100, "FONTES_VIGENTES", { fontes: usadas.length });

  const vigentes = usadas.length - problemas.length;
  return res(
    nome,
    "BLOCK",
    0,
    "FONTE_NAO_VIGENTE",
    { problemas, vigentes },
    "FONTE_NAO_VIGENTE",
  );
}

// ---------------------------------------------------------------- 6. ferramentas

/** Falha técnica nunca vira "não temos". */
export function ToolIntegrityValidator(ctx: ContextoConfianca): ResultadoValidador {
  const nome = "ToolIntegrityValidator";
  if (ctx.toolResults.length === 0) {
    // FASE 1 — a matriz central decide se este tipo de turno exige consulta.
    if (!aplicabilidadeDoTurno(ctx.turnType).requiresTool) {
      return res(nome, "NOT_APPLICABLE", 100, "TURNO_NAO_EXIGE_CONSULTA", {
        turnType: ctx.turnType ?? null,
      });
    }
    // FASE 3 — conversa simples dispensa ferramenta (NOT_APPLICABLE). Uma ação
    // que depende de dado oficial, sem NENHUMA consulta, é evidência ausente.
    const dependeDeDado =
      ACOES_COM_DADO_OFICIAL.has(acaoOuNenhuma(ctx.requestedAction)) ||
      ctx.requestedAction === "desconhecida";
    return dependeDeDado && !ctx.retrievedSources.some(fonteUtil)
      ? res(nome, "UNKNOWN", 0, "SEM_CONSULTA_PARA_ACAO_QUE_EXIGE_DADO", {
          requestedAction: ctx.requestedAction,
        })
      : res(nome, "NOT_APPLICABLE", 100, "SEM_FERRAMENTAS", {});
  }

  // FASE 2 — falha RECUPERADA não contamina o turno: se a MESMA consulta foi
  // refeita com sucesso, o resultado vigente é o sucesso. O histórico continua
  // registrado como evidência, mas não bloqueia.
  const identidade = (f: (typeof ctx.toolResults)[number]) => `${f.nome}|${f.capacidade ?? ""}`;
  const ultimoOkPorConsulta = new Map<string, number>();
  ctx.toolResults.forEach((f, i) => {
    if (ferramentaOk(f)) ultimoOkPorConsulta.set(identidade(f), i);
  });
  const recuperadas = ctx.toolResults.filter(
    (f, i) => !ferramentaOk(f) && (ultimoOkPorConsulta.get(identidade(f)) ?? -1) > i,
  );
  const falhas = ctx.toolResults.filter(
    (f, i) => !ferramentaOk(f) && (ultimoOkPorConsulta.get(identidade(f)) ?? -1) <= i,
  );
  if (falhas.length > 0) {
    return res(
      nome,
      "BLOCK",
      0,
      "FERRAMENTA_FALHOU",
      {
        falhas: falhas.map((f) => ({ nome: f.nome, erro: f.erro ?? "sem resposta" })),
        ...(recuperadas.length > 0
          ? { recuperadas: recuperadas.map((f) => ({ nome: f.nome, erro: f.erro ?? null })) }
          : {}),
      },
      "FERRAMENTA_FALHOU",
    );
  }
  const efetivas = ctx.toolResults.filter((f) => ferramentaOk(f));
  const vazias = efetivas.filter((f) => f.temConteudo === false);
  if (efetivas.length > 0 && vazias.length === efetivas.length) {
    return res(nome, "WARNING", 60, "RETORNO_VAZIO", {
      ferramentas: vazias.map((f) => f.nome),
      ...(recuperadas.length > 0 ? { tentativasRecuperadas: recuperadas.length } : {}),
    });
  }
  if (recuperadas.length > 0) {
    return res(nome, "PASS", 100, "FERRAMENTAS_INTEGRAS_APOS_RETRY", {
      executadas: ctx.toolResults.length,
      recuperadas: recuperadas.map((f) => ({ nome: f.nome, erro: f.erro ?? null })),
    });
  }

  return res(nome, "PASS", 100, "FERRAMENTAS_INTEGRAS", { executadas: ctx.toolResults.length });
}

// ---------------------------------------------------------------- 7. conflitos

/** Duas origens discordando não permitem escolha arbitrária. */
export function ConflictValidator(ctx: ContextoConfianca): ResultadoValidador {
  const nome = "ConflictValidator";
  const conflitos = (ctx.conflitos ?? []).filter((c) => {
    const distintos = new Set(c.valores.map((v) => v.valor.trim().toLowerCase()));
    return distintos.size > 1;
  });
  if ((ctx.conflitos ?? []).length === 0) return res(nome, "NOT_APPLICABLE", 100, "SEM_CONFLITOS", {});
  if (conflitos.length === 0) return res(nome, "PASS", 100, "ORIGENS_CONCORDAM", { avaliados: ctx.conflitos?.length });

  return res(
    nome,
    "BLOCK",
    0,
    "CONFLITO_DE_FONTE",
    { conflitos },
    "CONFLITO_DE_FONTE",
  );
}

// ---------------------------------------------------------------- 8. regras

/** Regra determinística da clínica não pode ser sobrescrita pelo modelo. */
export function BusinessRulesValidator(ctx: ContextoConfianca): ResultadoValidador {
  const nome = "BusinessRulesValidator";
  const regras = ctx.regrasNegocio ?? [];
  if (regras.length === 0) return res(nome, "NOT_APPLICABLE", 100, "SEM_REGRAS", {});

  const exigeHumano = regras.filter((r) => r.exigeHumano === true);
  if (exigeHumano.length > 0) {
    return res(
      nome,
      "BLOCK",
      0,
      "REGRA_EXIGE_HUMANO",
      { regras: exigeHumano.map((r) => r.id) },
      "REGRA_EXIGE_HUMANO",
    );
  }
  const violadas = regras.filter((r) => !r.satisfeita);
  if (violadas.length > 0) {
    return res(
      nome,
      "BLOCK",
      0,
      "REGRA_DE_NEGOCIO_NAO_ATENDIDA",
      { regras: violadas.map((r) => ({ id: r.id, descricao: r.descricao ?? null })) },
      "REGRA_DE_NEGOCIO_NAO_ATENDIDA",
    );
  }
  return res(nome, "PASS", 100, "REGRAS_ATENDIDAS", { avaliadas: regras.length });
}

// ---------------------------------------------------------------- 9. risco

const RISCO_POR_ACAO: Record<string, NivelRiscoAcao> = {
  responder_informacao: "LOW",
  identificar_paciente: "MEDIUM",
  informar_valor: "MEDIUM",
  informar_preparo: "MEDIUM",
  informar_regra: "MEDIUM",
  informar_profissional: "MEDIUM",
  informar_horario: "HIGH",
  informar_disponibilidade: "HIGH",
  criar_agendamento: "CRITICAL",
  cancelar_agendamento: "CRITICAL",
  transferir_humano: "LOW",
  // Turno conversacional: nada executável em jogo.
  nenhuma: "LOW",
  desconhecida: "MEDIUM",
};

/** Classifica o impacto da ação e a exigência de confiança correspondente. */
export function ActionRiskValidator(ctx: ContextoConfianca): ResultadoValidador {
  const nome = "ActionRiskValidator";
  const acao = acaoOuNenhuma(ctx.requestedAction);
  const risco = RISCO_POR_ACAO[acao] ?? "MEDIUM";
  const minimo = MINIMO_POR_RISCO[risco];
  const status: StatusValidador = risco === "CRITICAL" ? "WARNING" : "PASS";
  return res(nome, status, 100, `RISCO_${risco}`, { risco, minimoExigido: minimo, acao });
}

// ---------------------------------------------------------------- orquestração

export type EntradaValidadores = {
  ctx: ContextoConfianca;
  categorias?: string[];
  config?: ConfigValidadores;
  agora?: Date;
};

/**
 * Roda todos os validadores isoladamente. Um erro em qualquer um deles vira
 * WARNING auditável — o atendimento nunca cai por causa do motor.
 */
export function executarValidadoresDeConfianca({
  ctx,
  categorias = [],
  config = CONFIG_PADRAO_VALIDADORES,
  agora = new Date(),
}: EntradaValidadores): ResultadoValidador[] {
  const registro: { nome: string; run: () => ResultadoValidador }[] = [
    { nome: "IntentClarityValidator", run: () => IntentClarityValidator(ctx) },
    { nome: "EntityResolutionValidator", run: () => EntityResolutionValidator(ctx) },
    { nome: "RequiredDataValidator", run: () => RequiredDataValidator(ctx) },
    { nome: "OfficialSourceValidator", run: () => OfficialSourceValidator(ctx, categorias) },
    { nome: "SourceFreshnessValidator", run: () => SourceFreshnessValidator(ctx, agora) },
    { nome: "ToolIntegrityValidator", run: () => ToolIntegrityValidator(ctx) },
    { nome: "ConflictValidator", run: () => ConflictValidator(ctx) },
    { nome: "BusinessRulesValidator", run: () => BusinessRulesValidator(ctx) },
    { nome: "ActionRiskValidator", run: () => ActionRiskValidator(ctx) },
    // FASE 4 — o processo que levou à resposta precisa fazer sentido.
    { nome: "WorkflowConsistencyValidator", run: () => WorkflowConsistencyValidator(ctx) },
    // FASE 5 — cada afirmação da resposta final precisa da sua própria fonte.
    { nome: "ClaimGroundingValidator", run: () => ClaimGroundingValidator(ctx) },
  ];

  return registro.map(({ nome, run }) => {
    const cfg = config[nome] ?? { ativo: true, peso: 0 };
    if (!cfg.ativo) {
      return { ...res(nome, "NOT_APPLICABLE", 100, "VALIDADOR_DESLIGADO", {}), peso: 0 };
    }
    try {
      const r = run();
      // UNKNOWN não desconta ponto: ele derruba a COBERTURA (policy.ts).
      return { ...r, peso: contaContraANota(r.status) ? cfg.peso : 0 };
    } catch (err) {
      return {
        ...res(nome, "WARNING", 50, "VALIDADOR_FALHOU", {
          erro: err instanceof Error ? err.message : String(err),
        }),
        peso: 0,
      };
    }
  });
}

export { WorkflowConsistencyValidator, classificarAfirmacaoOperacional } from "./workflow";

/** Risco da ação conforme o ActionRiskValidator (usado pelo motor). */
export function riscoDaAcao(ctx: ContextoConfianca): NivelRiscoAcao {
  const acao = acaoOuNenhuma(ctx.requestedAction);
  // FASE 1 — turno sem ação executável não carrega risco de ação.
  if (!aplicabilidadeDoTurno(ctx.turnType).requiresActionSafety && !acaoExecutavel(ctx.requestedAction)) {
    return "LOW";
  }
  return RISCO_POR_ACAO[acao] ?? "MEDIUM";
}
