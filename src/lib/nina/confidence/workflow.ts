/**
 * FASE 4 — COERÊNCIA DE PROCESSO E PROVA DE AÇÕES.
 *
 * O que faltava no motor: verificar se o CAMINHO que levou à resposta faz
 * sentido. Não basta a frase estar bem escrita e as fontes existirem; a Nina
 * não pode afirmar que fez (ou que não conseguiu fazer) uma operação que o
 * sistema não registra.
 *
 * Regras inegociáveis:
 * 1. Afirmar SUCESSO exige prova persistida (appointment_id ou equivalente).
 * 2. Afirmar FALHA exige tentativa real que falhou (ferramenta chamada).
 * 3. Ferramenta EXECUTADA não é o mesmo que ferramenta que COMPROVOU o que a
 *    frase diz.
 * 4. Ausência de estado é `UNKNOWN` — nunca "não aconteceu" nem "aconteceu".
 *
 * Este módulo NÃO duplica a máquina de estados do atendimento
 * (`EstadoFluxoNina`): ele só a lê e compara com o texto e as ferramentas.
 */
import type {
  Bloqueador,
  ContextoConfianca,
  EstadoOperacionalTurno,
  ResultadoValidador,
  StatusValidador,
} from "./types";

const NOME = "WorkflowConsistencyValidator";

/** O que a resposta está afirmando sobre uma operação do sistema. */
export type AfirmacaoOperacional =
  | "nenhuma"
  | "sucesso_agendamento"
  | "falha_agendamento"
  | "promessa_agendamento";

const AFIRMA_SUCESSO =
  /(agendei|marquei|reservei|agendamento\s+(foi\s+)?(realizado|conclu[íi]do|confirmado)|consulta\s+(foi\s+)?(agendada|marcada|confirmada)|est[áa]\s+(agendad[oa]|marcad[oa]|confirmad[oa])|hor[áa]rio\s+(foi\s+)?(reservado|confirmado))/i;

const AFIRMA_FALHA =
  /(n[ãa]o\s+consegui\s+(concluir|realizar|finalizar|fazer)\s+(o\s+|seu\s+)?agendamento|n[ãa]o\s+foi\s+poss[íi]vel\s+(concluir|realizar|finalizar)\s+(o\s+|seu\s+)?agendamento|falha\s+ao\s+agendar|n[ãa]o\s+consegui\s+(marcar|agendar))/i;

const AFIRMA_PROMESSA = /((estou|vou|irei)\s+agend|agendando\s+(para|seu)|j[áa]\s+vou\s+marcar)/i;

/** Etapas em que um agendamento gravado é coerente. */
const ETAPAS_COM_AGENDAMENTO = new Set(["BOOKED", "APPOINTMENT_CONFIRMED", "COMPLETED"]);

/** Etapas em que o fluxo de agendamento está claramente em curso. */
const ETAPAS_FLUXO_AGENDAMENTO = new Set([
  "BOOKING_INTENT_CONFIRMED",
  "BOOKING_INTENT_PENDING",
  "IDENTIFYING_PATIENT",
  "COLLECTING_PATIENT_DATA",
  "COLLECTING_BOOKING_PREFERENCES",
  "CHOOSING_SLOT",
  "CHECKING_AVAILABILITY",
  "WAITING_SLOT_SELECTION",
  "AWAITING_SLOT_CONFIRMATION",
  "AWAITING_PATIENT_DATA",
  "WAITING_FINAL_CONFIRMATION",
  "REVALIDATING_SLOT",
  "CREATING_APPOINTMENT",
  "APPOINTMENT_FAILED",
]);

/** Classifica a afirmação operacional presente no rascunho da resposta. */
export function classificarAfirmacaoOperacional(texto?: string | null): AfirmacaoOperacional {
  const t = (texto ?? "").trim();
  if (!t) return "nenhuma";
  // A falha vem primeiro: "não consegui concluir seu agendamento" contém
  // palavras que também casariam com promessa/sucesso.
  if (AFIRMA_FALHA.test(t)) return "falha_agendamento";
  if (AFIRMA_SUCESSO.test(t)) return "sucesso_agendamento";
  if (AFIRMA_PROMESSA.test(t)) return "promessa_agendamento";
  return "nenhuma";
}

const ACOES_DE_ESCRITA = new Set(["criar_agendamento", "cancelar_agendamento"]);

function r(
  status: StatusValidador,
  score: number,
  reasonCode: string,
  evidence: Record<string, unknown>,
  blocker: Bloqueador | null = null,
): ResultadoValidador {
  return {
    validator: NOME,
    status,
    score: Math.max(0, Math.min(100, score)),
    reasonCode,
    evidence,
    blocker,
  };
}

function fluxoAtivo(st: EstadoOperacionalTurno): boolean {
  return (
    st.appointmentFlowActive === true ||
    st.bookingIntentConfirmed === true ||
    (typeof st.workflowState === "string" && ETAPAS_FLUXO_AGENDAMENTO.has(st.workflowState))
  );
}

/** A ferramenta de agendar chegou a ser chamada de fato neste turno. */
function ferramentaAgendarChamada(ctx: ContextoConfianca, st: EstadoOperacionalTurno): boolean {
  if (st.appointmentToolCalled === true) return true;
  return ctx.toolResults.some(
    (f) => f.capacidade === "createAppointment" || /agendar|createAppointment/i.test(f.nome),
  );
}

/**
 * Valida intenção -> ação -> workflow -> ferramentas -> resposta.
 * Nunca inventa estado: sem informação devolve UNKNOWN.
 */
export function WorkflowConsistencyValidator(ctx: ContextoConfianca): ResultadoValidador {
  const afirmacao = classificarAfirmacaoOperacional(ctx.draftText);
  const acaoEscrita = ctx.requestedAction !== null && ACOES_DE_ESCRITA.has(ctx.requestedAction);
  const st = ctx.operationalState;

  // Nada operacional em jogo: esta dimensão não é necessária neste turno.
  if (afirmacao === "nenhuma" && !acaoEscrita && !st?.appointmentFlowActive) {
    return r("NOT_APPLICABLE", 100, "SEM_AFIRMACAO_OPERACIONAL", { afirmacao });
  }

  // Há afirmação/ação operacional, mas o runtime não informou o estado real.
  // Isso é falta de evidência, não aprovação.
  if (!st || Object.keys(st).length === 0) {
    return r("UNKNOWN", 0, "ESTADO_OPERACIONAL_DESCONHECIDO", {
      afirmacao,
      acao: ctx.requestedAction,
    });
  }

  const chamou = ferramentaAgendarChamada(ctx, st);
  const criado = st.appointmentCreated === true;
  const prova = typeof st.appointmentId === "string" && st.appointmentId.trim() !== "";
  const tentou = st.appointmentAttempted === true || chamou;
  const ativo = fluxoAtivo(st);
  const base = {
    afirmacao,
    acao: ctx.requestedAction,
    workflowState: st.workflowState ?? null,
    appointmentToolCalled: chamou,
    appointmentAttempted: tentou,
    appointmentCreated: criado,
    temProva: prova,
    fluxoAtivo: ativo,
  };

  // (A) Sucesso gravado sem prova persistida: não se afirma o que não existe.
  if (criado && !prova) {
    return r(
      "BLOCK",
      0,
      "SUCESSO_SEM_PROVA_PERSISTIDA",
      base,
      "AFIRMACAO_OPERACIONAL_SEM_PROVA",
    );
  }

  // (B) Estado conflitante: sistema diz gravado, etapa diz que não.
  if (
    criado &&
    typeof st.workflowState === "string" &&
    st.workflowState !== "" &&
    !ETAPAS_COM_AGENDAMENTO.has(st.workflowState)
  ) {
    return r("BLOCK", 0, "ESTADO_CONFLITANTE", base, "WORKFLOW_INCONSISTENTE");
  }
  if (criado && !chamou) {
    return r("BLOCK", 0, "AGENDAMENTO_SEM_FERRAMENTA", base, "WORKFLOW_INCONSISTENTE");
  }

  // (C) Afirmação de sucesso.
  if (afirmacao === "sucesso_agendamento") {
    if (criado && prova) return r("PASS", 100, "SUCESSO_COM_PROVA", base);
    return r(
      "BLOCK",
      0,
      "AFIRMA_SUCESSO_SEM_PROVA",
      base,
      "AFIRMACAO_OPERACIONAL_SEM_PROVA",
    );
  }

  // (D) Afirmação de falha — o caso originador do bug.
  if (afirmacao === "falha_agendamento") {
    if (!ativo && !acaoEscrita) {
      // Pedido informativo respondido com falha de agendamento: o processo
      // não bate com o pedido. Isso jamais pode sair como alta confiança.
      return r(
        "BLOCK",
        0,
        "FLUXO_INFORMATIVO_COM_FALHA_DE_AGENDAMENTO",
        base,
        "WORKFLOW_INCONSISTENTE",
      );
    }
    if (!tentou) {
      return r(
        "BLOCK",
        0,
        "AFIRMA_FALHA_SEM_TENTATIVA",
        base,
        "AFIRMACAO_OPERACIONAL_SEM_PROVA",
      );
    }
    if (criado) {
      return r("BLOCK", 0, "FALHA_DECLARADA_COM_AGENDAMENTO_GRAVADO", base, "WORKFLOW_INCONSISTENTE");
    }
    return r("PASS", 100, "FALHA_COM_TENTATIVA_REAL", base);
  }

  // (E) Promessa de agendar sem fluxo de agendamento em curso.
  if (afirmacao === "promessa_agendamento" && !ativo) {
    return r("BLOCK", 0, "PROMESSA_SEM_FLUXO_ATIVO", base, "WORKFLOW_INCONSISTENTE");
  }

  // (F) Ação de escrita: confirmação final sem chamar a ferramenta obrigatória.
  if (acaoEscrita) {
    if (st.finalConfirmationReceived === true && !chamou) {
      return r(
        "BLOCK",
        0,
        "FERRAMENTA_OBRIGATORIA_NAO_CHAMADA",
        base,
        "FERRAMENTA_OBRIGATORIA_NAO_CHAMADA",
      );
    }
    if (st.bookingIntentConfirmed === false && !ativo) {
      return r("BLOCK", 0, "ACAO_SEM_INTENCAO_CONFIRMADA", base, "WORKFLOW_INCONSISTENTE");
    }
    if (chamou && !criado) {
      // Tentativa real que falhou: não é mentira, mas não é confiança alta.
      return r("WARNING", 40, "TENTATIVA_DE_AGENDAMENTO_FALHOU", base);
    }
  }

  if (chamou && !criado && !acaoEscrita) {
    return r("WARNING", 50, "FERRAMENTA_SEM_RESULTADO_PERSISTIDO", base);
  }

  return r("PASS", 100, "PROCESSO_COERENTE", base);
}
