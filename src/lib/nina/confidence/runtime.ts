/**
 * INTEGRAÇÃO DO CONFIDENCE DECISION ENGINE COM O ATENDIMENTO REAL (Fase 4).
 *
 * Camada pura (sem banco, sem rede, sem modelo) que traduz o estado real do
 * turno da Nina para o contrato do motor e traduz a decisão de volta para o
 * que o pipeline precisa: instrução de esclarecimento, resumo estruturado do
 * handoff e registro de auditoria.
 *
 * Mesma regra para atendimento real e homologação: muda só o campo `ambiente`.
 */
import type { DecisaoConfianca } from "../confidence-engine";
import type { TipoTurno } from "./turno-tipo";
import { decidirConfianca } from "./engine";
import { enriquecerContextoAvaliacao } from "./contexto-avaliacao";
import { assegurarAvaliacaoDoTextoFinal, verificarRespostaFinal } from "./final-answer";
import type { HardBlocker } from "./policy";
import { contaContraANota } from "./types";
import type {
  AcaoSolicitada,
  ContextoConfianca,
  ResultadoConfianca,
  ResultadoFerramenta,
} from "./types";

/** O que uma ferramenta fez neste turno (vem do Tool Broker). */
export type FerramentaDoTurno = {
  nome: string;
  capacidade: string | null;
  fonte: string | null;
  success: boolean;
  erro?: string | undefined;
};

export type EstadoDoTurno = {
  /** Rascunho da resposta do modelo, quando já existe. */
  texto?: string | null;
  /**
   * O que a Nina pretende fazer. Ausente (`undefined`) = `desconhecida`
   * (nunca otimista). `null` = turno legitimamente sem ação executável.
   */
  acao?: AcaoSolicitada | null;
  /** FASE 1 — natureza do turno; comanda a matriz de exigências. */
  tipoTurno?: TipoTurno | null;
  /** Mensagem do paciente neste turno (entra no resumo do handoff). */
  mensagemPaciente?: string | null;
  /** Intenção detectada pelo runtime, quando houver. */
  intent?: string | null;
  ferramentas: FerramentaDoTurno[];
  catalogoEncontrou: boolean;
  agendamentoConfirmado: boolean;
  pacienteIdentificado: boolean;
  esclarecimentoUsado: boolean;
  handoffSolicitado: boolean;
  ambiente?: "producao" | "homologacao";
  clinicaId?: string | null;
  conversaId?: string | null;
  messageId?: string | null;
  entities?: Record<string, unknown>;
  requiredFields?: string[];
  /** Sinais opcionais repassados ao motor (usados pela matriz de homologação). */
  intentAmbiguo?: boolean;
  intentConfidence?: number;
  entityCandidates?: Record<string, string[]>;
  conflitos?: ContextoConfianca["conflitos"];
  retrievedSources?: ContextoConfianca["retrievedSources"];
  /** FASE 2 — fatos extraídos pelo servidor dos retornos reais das ferramentas. */
  fatos?: ContextoConfianca["fatos"];
  /** FASE 2 — estado real de cada consulta do turno (tentativas, vazio, truncado). */
  consultas?: ContextoConfianca["consultas"];
  /** FASE 5/7 — claims estruturados declarados pelo próprio ciclo do turno. */
  claims?: ContextoConfianca["claims"];

  regrasNegocio?: ContextoConfianca["regrasNegocio"];
  /**
   * FASE 4 — estado real do fluxo operacional (leitura da máquina de estados
   * já existente do atendimento). Ausente = desconhecido, nunca "não houve".
   */
  estadoOperacional?: ContextoConfianca["operationalState"];
  /**
   * FASE 1 (motor) — instruções PUBLICADAS usadas nesta execução. Conteúdo
   * confiável; a mensagem do paciente e o retorno das ferramentas continuam
   * sendo dado a verificar.
   */
  instrucoes?: ContextoConfianca["instrucoes"];
};

const CAP_CATALOGO = new Set(["searchKnowledgeBase", "listCatalog"]);

/** Traduz o estado do turno para o contrato do motor. */
export function montarContextoDoTurno(e: EstadoDoTurno): ContextoConfianca {
  const toolResults: ResultadoFerramenta[] = e.ferramentas.map((f) => ({
    nome: f.nome,
    capacidade: f.capacidade,
    fonte: f.fonte,
    success: f.success,
    erro: f.erro ?? null,
    temConteudo:
      f.capacidade !== null && CAP_CATALOGO.has(f.capacidade)
        ? e.catalogoEncontrou
        : f.success && !f.erro,
  }));

  // FASE 1 (motor) — o contexto avaliado é completado com o que o turno já
  // tem: fontes derivadas dos fatos, conflitos detectados, candidatos de
  // entidade e campos obrigatórios da ação. Nada é inventado: o que a origem
  // não informou continua ausente.
  return enriquecerContextoAvaliacao({
    conversationId: e.conversaId ?? null,
    messageId: e.messageId ?? null,
    intent: e.intent ?? null,
    // Mensagem COMPLETA do turno (lote inteiro) — dado, nunca instrução.
    mensagemPaciente: e.mensagemPaciente ?? null,
    ...(e.instrucoes ? { instrucoes: e.instrucoes } : {}),
    // FASE 2: ausência de ação NÃO vira "responder_informacao". Se o runtime
    // não sabe o que a Nina vai fazer, o motor precisa enxergar isso.
    requestedAction: e.acao === undefined ? "desconhecida" : e.acao,
    ...(e.tipoTurno !== undefined ? { turnType: e.tipoTurno } : {}),
    entities: e.entities ?? {},
    retrievedSources: e.retrievedSources ?? [],
    ...(e.intentAmbiguo !== undefined ? { intentAmbiguo: e.intentAmbiguo } : {}),
    ...(e.intentConfidence !== undefined ? { intentConfidence: e.intentConfidence } : {}),
    ...(e.entityCandidates ? { entityCandidates: e.entityCandidates } : {}),
    ...(e.conflitos ? { conflitos: e.conflitos } : {}),
    ...(e.claims ? { claims: e.claims } : {}),
    ...(e.regrasNegocio ? { regrasNegocio: e.regrasNegocio } : {}),
    ...(e.estadoOperacional ? { operationalState: e.estadoOperacional } : {}),
    ...(e.fatos ? { fatos: e.fatos } : {}),
    ...(e.consultas ? { consultas: e.consultas } : {}),
    toolResults,
    ...(e.requiredFields ? { requiredFields: e.requiredFields } : {}),

    businessContext: {
      clinicaId: e.clinicaId ?? null,
      ambiente: e.ambiente ?? "producao",
      pacienteIdentificado: e.pacienteIdentificado,
      agendamentoConfirmado: e.agendamentoConfirmado,
      esclarecimentoUsado: e.esclarecimentoUsado,
      handoffSolicitado: e.handoffSolicitado,
    },
    draftText: e.texto ?? null,
  });
}

/**
 * Decide com o motor central a partir do estado real do turno.
 * A política só é diferente da padrão quando um ajuste APROVADO por uma
 * pessoa foi aplicado (FASE 9) — a Nina nunca muda a política sozinha.
 */
export function decidirNoTurno(
  e: EstadoDoTurno,
  politica?: import("./policy").PoliticaConfianca,
): ResultadoConfianca {
  return decidirConfianca(
    { ...montarContextoDoTurno(e), tipoAvaliacao: "action_safety" },
    politica ? { politica } : {},
  );
}

/**
 * FASE 5 — avalia a MENSAGEM FINAL (já pós-processada) que o paciente vai
 * receber. Roda depois de saudação obrigatória, avisos internos e qualquer
 * outro ajuste de texto — nunca sobre o rascunho do modelo.
 */
export function verificarRespostaFinalDoTurno(
  e: EstadoDoTurno,
  textoFinal: string,
  politica?: import("./policy").PoliticaConfianca,
): ResultadoConfianca {
  return verificarRespostaFinal({
    ctx: montarContextoDoTurno(e),
    textoFinal,
    ...(politica ? { politica } : {}),
  });
}

/** GATE DE SAÍDA: o score gravado tem de ser o do texto realmente enviado. */
export function garantirScoreDoTextoEnviado(
  e: EstadoDoTurno,
  textoFinal: string,
  avaliacaoPrevia?: ResultadoConfianca | null,
  politica?: import("./policy").PoliticaConfianca,
) {
  return assegurarAvaliacaoDoTextoFinal({
    ctx: montarContextoDoTurno(e),
    textoFinal,
    ...(avaliacaoPrevia ? { avaliacaoPrevia } : {}),
    ...(politica ? { politica } : {}),
  });
}


const LEGADOS = new Set([
  "VALOR_SEM_CATALOGO",
  "AGENDA_SEM_CONFIRMACAO",
  "FERRAMENTA_FALHOU",
  "PREPARO_SEM_FONTE",
]);

/**
 * Converte a decisão para o formato já persistido em
 * `nina_confianca_decisoes`, sem perder o código canônico do bloqueio.
 */
export function paraDecisaoLegado(r: ResultadoConfianca): DecisaoConfianca {
  const acao =
    r.decision === "ALLOW" ? "responder" : r.decision === "CLARIFY" ? "esclarecer" : "transferir";
  const legado = r.blockers.find((b) => LEGADOS.has(b)) ?? null;
  const canonicos = (r.hardBlockers ?? []) as HardBlocker[];
  const motivos = [...r.evidence.motivos];
  if (canonicos.length > 0) motivos.push(`bloqueadores: ${canonicos.join(", ")}`);
  motivos.push(`nivel ${r.level} | decisao ${r.decision}`);
  return {
    score: r.score,
    acao: acao as DecisaoConfianca["acao"],
    bloqueio: (legado ?? canonicos[0] ?? null) as DecisaoConfianca["bloqueio"],
    categorias: r.evidence.categorias as DecisaoConfianca["categorias"],
    motivos,
  };
}

/**
 * Instrução interna da rodada de esclarecimento (nunca vai ao paciente).
 * Uma pergunta só — a que resolve o problema detectado. Nada de interrogatório.
 */
export function instrucaoEsclarecimentoDirigida(r: ResultadoConfianca): string {
  const falhou = (r.validators ?? []).filter(
    (v) => v.status !== "PASS" && v.status !== "NOT_APPLICABLE",
  );
  const nomes = falhou.map((v) => v.validator);
  let alvo =
    "o que exatamente ele precisa (procedimento, convênio, unidade ou profissional)";
  if (nomes.includes("EntityResolutionValidator")) {
    alvo = "QUAL item específico ele quer, citando as opções encontradas (ex.: qual ultrassonografia)";
  } else if (nomes.includes("RequiredDataValidator")) {
    const faltam = r.evidence.camposFaltantes;
    if (faltam.length > 0) alvo = `apenas o dado que falta: ${faltam.join(", ")}`;
  } else if (nomes.includes("IntentClarityValidator")) {
    alvo = "o que ele deseja resolver, em uma pergunta curta e direta";
  }
  return (
    "[SISTEMA] Confiança insuficiente para afirmar isso agora " +
    `(${r.evidence.motivos.join("; ")}). Não repita a afirmação. Faça UMA única pergunta curta ao paciente sobre ${alvo}. ` +
    "Não peça vários dados de uma vez. Depois da resposta dele, consulte a ferramenta correspondente antes de afirmar qualquer coisa."
  );
}

/** Motivo curto registrado no evento de handoff. */
export function motivoHandoff(r: ResultadoConfianca): string {
  const canonicos = r.hardBlockers ?? [];
  const base = canonicos.length > 0 ? `bloqueio ${canonicos.join(", ")}` : `confiança ${r.score}`;
  return `Confiabilidade insuficiente (${base}): ${r.evidence.motivos.join("; ")}`.slice(0, 500);
}

/**
 * Resumo estruturado entregue junto do handoff, para que o paciente não
 * precise repetir a conversa inteira.
 */
export function resumoHandoffEstruturado(e: EstadoDoTurno, r: ResultadoConfianca): string {
  // FASE 3: reprovado é uma coisa; não verificado é outra. O atendente humano
  // precisa ver a diferença para não tratar lacuna como erro comprovado.
  const validacoes = (r.validators ?? [])
    .filter((v) => contaContraANota(v.status))
    .map((v) => `${v.validator} (${v.status}: ${v.reasonCode})`);
  const naoVerificadas = (r.validators ?? [])
    .filter((v) => v.status === "UNKNOWN")
    .map((v) => `${v.validator} (${v.reasonCode})`);
  const conflitos = (r.validators ?? []).find((v) => v.validator === "ConflictValidator");
  const coletadas = Object.entries(e.entities ?? {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v)}`);
  const acoes = e.ferramentas.map(
    (f) => `${f.nome}${f.success && !f.erro ? " (ok)" : ` (falhou: ${f.erro ?? "sem resposta"})`}`,
  );

  const linhas = [
    `Intenção detectada: ${e.intent ?? (r.evidence.categorias.join(", ") || "não identificada")}`,
    `Pedido do paciente: ${(e.mensagemPaciente ?? "").trim() || "não registrado neste turno"}`,
    `Informações já coletadas: ${coletadas.length ? coletadas.join("; ") : "nenhuma"}`,
    `Paciente identificado: ${e.pacienteIdentificado ? "sim" : "não"}`,
    `Motivo da baixa confiança: ${r.evidence.motivos.join("; ")} (score ${r.score}, nível ${r.level})`,
    `Validações que falharam: ${validacoes.length ? validacoes.join("; ") : "nenhuma"}`,
    `Não foi possível verificar: ${naoVerificadas.length ? naoVerificadas.join("; ") : "nada"}`,
    `Cobertura de evidência: ${r.evidenceCoverage ?? 0}%${r.confidenceInsufficient ? " (sem evidência avaliável)" : ""}`,
    `Bloqueadores: ${(r.hardBlockers ?? []).join(", ") || "nenhum"}`,
    `Informação conflitante: ${
      conflitos && contaContraANota(conflitos.status)
        ? JSON.stringify(conflitos.evidence)
        : "nenhuma detectada"
    }`,
    `Ações já executadas: ${acoes.length ? acoes.join("; ") : "nenhuma consulta ao sistema"}`,
  ];
  return linhas.join("\n").slice(0, 2000);
}

// ------------------------------------------------- proteção do agendamento

export type EntradaCommitAgendamento = {
  /** Argumentos que o modelo quer gravar. */
  args: Record<string, unknown>;
  ferramentas: FerramentaDoTurno[];
  pacienteIdentificado: boolean;
  /** A disponibilidade foi confirmada em tempo real nesta conversa. */
  disponibilidadeConfirmada: boolean;
};

export type ResultadoCommitAgendamento = {
  liberado: boolean;
  faltas: string[];
  motivo: string;
};

const CAMPOS_AGENDAMENTO = ["medico_id", "inicio", "fim", "procedimento"];

/**
 * Validação final imediatamente antes de gravar o agendamento. Ação crítica:
 * só passa com paciente identificado, campos completos, disponibilidade
 * confirmada em tempo real e nenhuma ferramenta com falha no turno.
 * A confirmação ao paciente continua dependendo do retorno real do backend.
 */
export function validarAgendamentoAntesDoCommit(
  e: EntradaCommitAgendamento,
): ResultadoCommitAgendamento {
  const faltas: string[] = [];

  for (const campo of CAMPOS_AGENDAMENTO) {
    const v = e.args[campo];
    if (v === undefined || v === null || String(v).trim() === "") faltas.push(`campo:${campo}`);
  }
  if (!e.pacienteIdentificado) faltas.push("paciente_nao_identificado");
  if (!e.disponibilidadeConfirmada) faltas.push("disponibilidade_nao_confirmada");
  if (e.ferramentas.some((f) => !f.success || Boolean(f.erro))) faltas.push("ferramenta_com_falha");

  const inicio = String(e.args["inicio"] ?? "");
  const fim = String(e.args["fim"] ?? "");
  if (inicio && fim) {
    const ti = Date.parse(inicio);
    const tf = Date.parse(fim);
    if (Number.isNaN(ti) || Number.isNaN(tf)) faltas.push("horario_invalido");
    else if (tf <= ti) faltas.push("horario_inconsistente");
  }

  return {
    liberado: faltas.length === 0,
    faltas,
    motivo: faltas.length === 0 ? "validação final aprovada" : `validação final reprovada: ${faltas.join(", ")}`,
  };
}
