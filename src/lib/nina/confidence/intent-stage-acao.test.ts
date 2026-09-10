/**
 * FASE 1 (refatoração) — INTENT ≠ CONVERSATION STAGE ≠ REQUESTED ACTION.
 *
 * Intenção descreve o desejo do paciente. Estágio descreve onde a conversa
 * está. Ação executável só existe quando o fluxo real está prestes a executar.
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { derivarEtapa } from "../atendimento-fase6";
import { estadoVazio, type EstadoFluxoNina } from "../fluxo-estado.server";
import {
  intencaoCriticaSemExecucao,
  montarContextoCanonicoTurno,
  type EntradaContextoCanonico,
} from "./contexto-turno";

const deps = { detectarIntencoes, intencaoAmbigua };

function ctx(mensagem: string, over: Partial<EntradaContextoCanonico> = {}) {
  return montarContextoCanonicoTurno(
    { mensagemPaciente: mensagem, podeAgendar: true, ...over },
    deps,
  );
}

/** Estado real do fluxo no momento em que a criação é executada. */
function estadoProntoParaCriar(): EstadoFluxoNina {
  const base = estadoVazio();
  return {
    ...base,
    patient: { ...base.patient, id: "p1", first_name: "Ana", identified: true, validated: true },
    appointment: {
      ...base.appointment,
      intent_confirmed: true,
      procedure: "Cardiologia",
      doctor_name: "Dr. João",
      date: "2026-09-10",
      time: "09:00",
      slot_inicio: "2026-09-10T09:00:00",
      slot_confirmed_by_patient: true,
    },
  };
}

describe("caso 1 — 'quero agendar' é intenção, não ação", () => {
  const c = ctx("quero agendar");

  it("detecta a intenção de agendamento", () => {
    expect(c.intencoes).toContain("agendamento");
  });

  it("não vira criar_agendamento", () => {
    expect(c.requestedAction).not.toBe("criar_agendamento");
    expect(c.requestedAction).toBeNull();
    expect(intencaoCriticaSemExecucao(c)).toBe(true);
  });

  it("o estágio derivado é conversacional, não de criação", () => {
    const etapa = derivarEtapa({
      mensagem: "quero agendar",
      estado: estadoVazio(),
      primeiraMensagem: false,
      intencoes: c.intencoes,
    });
    expect(etapa).not.toBe("CREATING_APPOINTMENT");
    expect(etapa).toBe("BOOKING_INTENT_PENDING");
  });

  it("estágios intermediários do funil também não autorizam a criação", () => {
    for (const stage of [
      "BOOKING_INTENT_PENDING",
      "COLLECTING_PATIENT_DATA",
      "CHECKING_AVAILABILITY",
      "WAITING_SLOT_SELECTION",
      "WAITING_FINAL_CONFIRMATION",
    ] as const) {
      expect(ctx("quero agendar", { stage }).requestedAction).toBeNull();
    }
  });
});

describe("caso 2 — remarcação", () => {
  it("é intenção de remarcação e não vira criar_agendamento", () => {
    const c = ctx("quero remarcar minha consulta");
    expect(c.intencoes).toContain("remarcacao");
    expect(c.requestedAction).not.toBe("criar_agendamento");
    expect(c.requestedAction).toBeNull();
  });
});

describe("caso 3 — cancelamento", () => {
  it("intenção de cancelar não executa cancelamento", () => {
    const c = ctx("quero cancelar");
    expect(c.intencoes).toContain("cancelamento");
    expect(c.requestedAction).not.toBe("cancelar_agendamento");
    expect(c.requestedAction).toBeNull();
  });

  it("só vira cancelar_agendamento quando o cancelamento está em execução", () => {
    const c = ctx("quero cancelar", { cancelamentoEmExecucao: true });
    expect(c.requestedAction).toBe("cancelar_agendamento");
  });
});

describe("caso 4 — fluxo realmente no estágio de criação", () => {
  it("paciente identificado + vaga confirmada + CREATING_APPOINTMENT vira criar_agendamento", () => {
    const estado = estadoProntoParaCriar();
    const etapa = derivarEtapa({
      mensagem: "sim, pode confirmar",
      estado,
      primeiraMensagem: false,
      intencoes: [],
    });
    expect(etapa).toBe("CREATING_APPOINTMENT");

    const c = ctx("sim, pode confirmar", { stage: etapa });
    expect(c.stage).toBe("CREATING_APPOINTMENT");
    expect(c.requestedAction).toBe("criar_agendamento");
  });

  it("mesmo com a palavra agendar, é o estágio que autoriza", () => {
    expect(ctx("quero agendar", { stage: "CREATING_APPOINTMENT" }).requestedAction).toBe(
      "criar_agendamento",
    );
  });
});

describe("caso 5 — transferência humana", () => {
  it("pedido explícito continua gerando transferir_humano", () => {
    const c = ctx("quero falar com uma atendente");
    expect(c.intencoes).toContain("falar_humano");
    expect(c.requestedAction).toBe("transferir_humano");
  });
});

describe("intenções informativas seguem inalteradas", () => {
  it("preço continua informar_valor", () => {
    expect(ctx("quanto custa a consulta?").requestedAction).toBe("informar_valor");
  });

  it("ausência de sinal continua desconhecida", () => {
    expect(ctx("").requestedAction).toBe("desconhecida");
  });
});
