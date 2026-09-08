/**
 * FASE 4 — GATE DE COERÊNCIA DE PROCESSO E PROVA DE AÇÕES.
 *
 * Oito cenários obrigatórios + o caso originador (pedido informativo que
 * recebeu "Não consegui concluir seu agendamento"). Nenhum deles pode sair
 * como alta confiança sem prova do processo.
 */
import { describe, expect, it } from "bun:test";
import { decidirConfianca } from "./engine";
import { classificarAfirmacaoOperacional, WorkflowConsistencyValidator } from "./workflow";
import type { ContextoConfianca, EstadoOperacionalTurno } from "./types";

function ctxBase(over: Partial<ContextoConfianca> = {}): ContextoConfianca {
  return {
    conversationId: "conv-1",
    messageId: "msg-1",
    intent: "valor",
    requestedAction: "responder_informacao",
    entities: {},
    retrievedSources: [],
    toolResults: [],
    businessContext: {
      clinicaId: "clinica-1",
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
    draftText: null,
    ...over,
  };
}

const estado = (o: EstadoOperacionalTurno): EstadoOperacionalTurno => o;

describe("classificação da afirmação operacional", () => {
  it("separa falha, sucesso e promessa", () => {
    expect(
      classificarAfirmacaoOperacional("Não consegui concluir seu agendamento neste momento."),
    ).toBe("falha_agendamento");
    expect(classificarAfirmacaoOperacional("Sua consulta está agendada para amanhã.")).toBe(
      "sucesso_agendamento",
    );
    expect(classificarAfirmacaoOperacional("Vou agendar para você agora.")).toBe(
      "promessa_agendamento",
    );
    expect(classificarAfirmacaoOperacional("O valor do ultrassom é R$ 150.")).toBe("nenhuma");
  });
});

describe("FASE 4 — oito cenários de workflow", () => {
  it("1. informação -> informação: dimensão não se aplica", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({ draftText: "O ultrassom abdominal custa R$ 180." }),
    );
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  it("2. informação -> falsa falha de agendamento: bloqueado por incoerência", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({
        requestedAction: "informar_valor",
        draftText: "Não consegui concluir seu agendamento neste momento.",
        operationalState: estado({
          appointmentFlowActive: false,
          bookingIntentConfirmed: false,
          appointmentAttempted: false,
          appointmentToolCalled: false,
          appointmentCreated: false,
          workflowState: "INFORMATION_RESPONSE",
        }),
      }),
    );
    expect(r.status).toBe("BLOCK");
    expect(r.reasonCode).toBe("FLUXO_INFORMATIVO_COM_FALHA_DE_AGENDAMENTO");
    expect(r.blocker).toBe("WORKFLOW_INCONSISTENTE");
  });

  it("3. intenção confirmada -> agendamento real com prova: passa", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({
        requestedAction: "criar_agendamento",
        draftText: "Pronto, sua consulta está agendada para quinta às 14h.",
        operationalState: estado({
          bookingIntentConfirmed: true,
          appointmentFlowActive: true,
          patientDataComplete: true,
          slotSelected: true,
          finalConfirmationReceived: true,
          appointmentAttempted: true,
          appointmentToolCalled: true,
          appointmentCreated: true,
          appointmentId: "apt-123",
          workflowState: "APPOINTMENT_CONFIRMED",
        }),
      }),
    );
    expect(r.status).toBe("PASS");
    expect(r.reasonCode).toBe("SUCESSO_COM_PROVA");
  });

  it("4. confirmação sem tool: ferramenta obrigatória não chamada", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({
        requestedAction: "criar_agendamento",
        draftText: "Certo, vou registrar.",
        operationalState: estado({
          bookingIntentConfirmed: true,
          appointmentFlowActive: true,
          finalConfirmationReceived: true,
          appointmentToolCalled: false,
          appointmentAttempted: false,
          appointmentCreated: false,
          workflowState: "WAITING_FINAL_CONFIRMATION",
        }),
      }),
    );
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("FERRAMENTA_OBRIGATORIA_NAO_CHAMADA");
  });

  it("5. tool falhou: não é mentira, mas não é confiança alta", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({
        requestedAction: "criar_agendamento",
        draftText: "Vou verificar novamente.",
        toolResults: [
          {
            nome: "agendar",
            capacidade: "createAppointment",
            fonte: "agenda",
            success: false,
            erro: "conflito de horário",
          },
        ],
        operationalState: estado({
          bookingIntentConfirmed: true,
          appointmentFlowActive: true,
          finalConfirmationReceived: true,
          appointmentToolCalled: true,
          appointmentAttempted: true,
          appointmentCreated: false,
          workflowState: "APPOINTMENT_FAILED",
        }),
      }),
    );
    expect(r.status).toBe("WARNING");
    expect(r.reasonCode).toBe("TENTATIVA_DE_AGENDAMENTO_FALHOU");
  });

  it("6. tool nunca chamada mas resposta afirma sucesso: sem prova", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({
        requestedAction: "criar_agendamento",
        draftText: "Agendei sua consulta para sexta.",
        operationalState: estado({
          bookingIntentConfirmed: true,
          appointmentFlowActive: true,
          appointmentToolCalled: false,
          appointmentAttempted: false,
          appointmentCreated: false,
          workflowState: "CREATING_APPOINTMENT",
        }),
      }),
    );
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("AFIRMACAO_OPERACIONAL_SEM_PROVA");
    expect(r.reasonCode).toBe("AFIRMA_SUCESSO_SEM_PROVA");
  });

  it("7. tentativa que falhou legitimamente pode dizer que falhou", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({
        requestedAction: "criar_agendamento",
        draftText: "Não consegui concluir seu agendamento neste momento.",
        operationalState: estado({
          bookingIntentConfirmed: true,
          appointmentFlowActive: true,
          appointmentToolCalled: true,
          appointmentAttempted: true,
          appointmentCreated: false,
          workflowState: "APPOINTMENT_FAILED",
        }),
      }),
    );
    expect(r.status).toBe("PASS");
    expect(r.reasonCode).toBe("FALHA_COM_TENTATIVA_REAL");
  });

  it("8. conflito de estado: gravado sem etapa compatível", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({
        requestedAction: "criar_agendamento",
        draftText: "Tudo certo por aqui.",
        operationalState: estado({
          appointmentToolCalled: true,
          appointmentAttempted: true,
          appointmentCreated: true,
          appointmentId: "apt-9",
          workflowState: "COLLECTING_PATIENT_DATA",
        }),
      }),
    );
    expect(r.status).toBe("BLOCK");
    expect(r.blocker).toBe("WORKFLOW_INCONSISTENTE");
    expect(r.reasonCode).toBe("ESTADO_CONFLITANTE");
  });

  it("estado ausente com afirmação operacional é UNKNOWN, nunca PASS", () => {
    const r = WorkflowConsistencyValidator(
      ctxBase({ draftText: "Agendei sua consulta para sexta." }),
    );
    expect(r.status).toBe("UNKNOWN");
  });
});

describe("FASE 4 — caso originador no motor inteiro", () => {
  const ctxOriginador = ctxBase({
    intent: "valor",
    requestedAction: "informar_valor",
    draftText: "Não consegui concluir seu agendamento neste momento. Vou verificar novamente.",
    toolResults: [
      {
        nome: "buscar_catalogo",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo",
        success: true,
        temConteudo: true,
      },
    ],
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    operationalState: estado({
      bookingIntentConfirmed: false,
      appointmentFlowActive: false,
      appointmentAttempted: false,
      appointmentToolCalled: false,
      appointmentCreated: false,
      workflowState: "INFORMATION_RESPONSE",
    }),
  });

  it("nunca sai como alta confiança", () => {
    const r = decidirConfianca(ctxOriginador);
    expect(r.level).not.toBe("HIGH");
    expect(r.decision).not.toBe("ALLOW");
    expect(r.hardBlockers).toContain("WORKFLOW_STATE_MISMATCH");
  });

  it("handoff pedido pelo runtime não apaga o bloqueio de processo", () => {
    const r = decidirConfianca({
      ...ctxOriginador,
      businessContext: { ...ctxOriginador.businessContext, handoffSolicitado: true },
    });
    expect(r.score).toBeLessThan(90);
    expect(r.hardBlockers).toContain("WORKFLOW_STATE_MISMATCH");
  });
});
