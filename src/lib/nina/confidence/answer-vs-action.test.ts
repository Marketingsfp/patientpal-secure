/**
 * FASE 2 — ANSWER CONFIDENCE ≠ ACTION SAFETY.
 *
 * "Posso confiar no conteúdo desta mensagem?" e "é seguro executar esta ação
 * no sistema?" são perguntas diferentes. Uma etapa de coleta pode ter uma
 * resposta excelente enquanto a criação do agendamento continua bloqueada.
 */
import { describe, expect, it } from "bun:test";
import { decidirConfianca } from "./engine";
import { montarContextoDoTurno, type EstadoDoTurno } from "./runtime";
import type { ContextoConfianca } from "./types";

function estado(over: Partial<EstadoDoTurno> = {}): EstadoDoTurno {
  return {
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    ambiente: "homologacao",
    ...over,
  };
}

function resposta(e: Partial<EstadoDoTurno>): ContextoConfianca {
  return { ...montarContextoDoTurno(estado(e)), tipoAvaliacao: "answer_confidence" };
}

function acao(e: Partial<EstadoDoTurno>): ContextoConfianca {
  return { ...montarContextoDoTurno(estado(e)), tipoAvaliacao: "action_safety" };
}

// ---------------------------------------------------------------------------
// TESTE A — "quero agendar": coleta em andamento, nenhuma ação executável
// ---------------------------------------------------------------------------
describe("TESTE A — turno de coleta não é ação executável", () => {
  const base = {
    acao: "nenhuma" as const,
    intent: "agendamento",
    requiredFields: ["nome", "data"],
    entities: {},
    texto: "Claro. Para continuar, preciso confirmar alguns dados.",
  };

  it("a segurança da ação é Não aplicável — nunca bloqueio", () => {
    const r = decidirConfianca(acao(base));
    expect(r.actionSafety?.status).toBe("NOT_APPLICABLE");
    expect(r.actionSafety?.blockers).toEqual([]);
  });

  it("a confiança da resposta não é zerada por dado ainda não coletado", () => {
    const r = decidirConfianca(resposta(base));
    expect(r.score).toBeGreaterThan(0);
    expect(r.blockers).not.toContain("CAMPO_OBRIGATORIO_AUSENTE");
  });

  it("o dado que falta aparece como PENDENTE, não como erro da mensagem", () => {
    const r = decidirConfianca(resposta(base));
    const req = r.validators?.find((v) => v.validator === "RequiredDataValidator");
    expect(req?.status).toBe("PENDING");
    expect(r.pendingDimensions).toContain("RequiredDataValidator");
  });
});

// ---------------------------------------------------------------------------
// TESTE B — criação real sem os dados: ação bloqueada, mensagem não zerada
// ---------------------------------------------------------------------------
describe("TESTE B — criar_agendamento sem vaga/dados", () => {
  const base = {
    acao: "criar_agendamento" as const,
    intent: "agendamento",
    requiredFields: ["paciente_id", "slot"],
    entities: {},
    texto: "Antes de continuar, preciso confirmar seus dados.",
  };

  it("a ação fica BLOQUEADA", () => {
    const r = decidirConfianca(acao(base));
    expect(r.actionSafety?.status).toBe("BLOCKED");
    expect(r.actionSafety?.acao).toBe("criar_agendamento");
    expect(r.decision).not.toBe("ALLOW");
  });

  it("o bloqueio da ação não zera automaticamente a confiança da resposta", () => {
    const r = decidirConfianca(resposta(base));
    expect(r.score).toBeGreaterThan(0);
    expect(r.decision).not.toBe("BLOCK_ACTION");
  });
});

// ---------------------------------------------------------------------------
// TESTE C — tentativa válida
// ---------------------------------------------------------------------------
describe("TESTE C — criação com paciente e vaga confirmados", () => {
  it("a ação é liberada quando não há bloqueio", () => {
    const r = decidirConfianca(
      acao({
        acao: "criar_agendamento",
        intent: "agendamento",
        pacienteIdentificado: true,
        requiredFields: ["paciente_id", "slot"],
        entities: { paciente_id: "p1", slot: "2026-09-10T09:00:00" },
        ferramentas: [
          {
            nome: "consultar_agenda",
            capacidade: "agenda",
            fonte: "agenda",
            success: true,
            erro: undefined,
          },
        ],
        estadoOperacional: {
          bookingIntentConfirmed: true,
          appointmentFlowActive: true,
          patientDataComplete: true,
          slotSelected: true,
          finalConfirmationReceived: true,
          appointmentAttempted: true,
          appointmentToolCalled: true,
          appointmentCreated: true,
          appointmentId: "ag-1",
          workflowState: "CREATING_APPOINTMENT",
        },
        texto: "Agendamento confirmado.",
      }),
    );
    expect(r.actionSafety?.status).toBe("ALLOWED");
    expect(r.actionSafety?.hardBlockers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TESTE D — o score original nunca é reescrito depois
// ---------------------------------------------------------------------------
describe("TESTE D — score original é imutável", () => {
  it("reavaliar o mesmo contexto não altera o resultado já registrado", () => {
    const ctx = resposta({
      acao: "informar_valor",
      intent: "preco",
      catalogoEncontrou: true,
      texto: "A consulta de Cardiologia custa R$ 150.",
      ferramentas: [
        {
          nome: "consultar_catalogo",
          capacidade: "catalogo",
          fonte: "catalogo_publicado",
          success: true,
          erro: undefined,
        },
      ],
    });
    const primeiro = decidirConfianca(ctx);
    const snapshot = { score: primeiro.score, nivel: primeiro.level };
    const segundo = decidirConfianca(ctx);
    // Nada no motor reescreve o registro anterior: o reporte de erro é
    // guardado à parte, justamente para medir "95% que depois deu errado".
    expect(snapshot.score).toBe(segundo.score);
    expect(snapshot.nivel).toBe(segundo.level);
  });
});
