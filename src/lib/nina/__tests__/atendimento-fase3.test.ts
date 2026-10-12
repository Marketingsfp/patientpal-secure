import { describe, it, expect } from "bun:test";
import { estadoVazio, type EstadoFluxoNina } from "../fluxo-estado.server";
import { resumoEntregueFixture } from "./agendamento-fixture";
import { avaliarIntencaoAgendar, dadosFaltantes } from "../atendimento-fase3";

function estado(mod: (e: EstadoFluxoNina) => void = () => {}): EstadoFluxoNina {
  const e = estadoVazio();
  mod(e);
  return e;
}

function confirmarAtendimento(e: EstadoFluxoNina) {
  Object.assign(e.appointment, {
    procedure: "Consulta",
    doctor_id: "medico",
    slot_inicio: "2030-01-01T14:00:00Z",
    slot_fim: "2030-01-01T14:30:00Z",
    slot_confirmed_by_patient: true,
    intent_confirmed: true,
  });
  resumoEntregueFixture(e, "clinica", false);
  e.appointment.intent_confirmed = true;
}

describe("confirmação de intenção de agendar", () => {
  it("pergunta de valor não confirma", () => {
    expect(avaliarIntencaoAgendar("Quanto custa Cardiologia?", estado()).confirmado).toBe(false);
  });
  it('"quero agendar" confirma', () => {
    expect(avaliarIntencaoAgendar("Quero agendar", estado()).confirmado).toBe(true);
  });
  it('"pode marcar" confirma', () => {
    expect(avaliarIntencaoAgendar("Pode marcar", estado()).confirmado).toBe(true);
  });
  it('"quero esse horário" confirma', () => {
    expect(avaliarIntencaoAgendar("Quero esse horário", estado()).confirmado).toBe(true);
  });
  it('"gostaria de fazer o agendamento" confirma', () => {
    expect(avaliarIntencaoAgendar("Gostaria de fazer o agendamento", estado()).confirmado).toBe(
      true,
    );
  });
  it('"sim" só confirma quando existe vaga na mesa', () => {
    expect(avaliarIntencaoAgendar("sim", estado()).confirmado).toBe(false);
    const comVaga = estado((e) => {
      e.appointment.slot_inicio = "2026-09-10T14:00:00Z";
    });
    expect(avaliarIntencaoAgendar("sim", comVaga).confirmado).toBe(true);
  });
  it("perguntar disponibilidade é interesse, não confirmação", () => {
    const r = avaliarIntencaoAgendar("Tem vaga no sábado?", estado());
    expect(r.confirmado).toBe(false);
    expect(r.interesse).toBe(true);
  });
});
