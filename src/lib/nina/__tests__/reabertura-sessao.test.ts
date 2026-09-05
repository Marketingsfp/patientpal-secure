import { describe, it, expect } from "bun:test";
import { normalizarEstado } from "../fluxo-estado-normalizar";
import { reabrirSessao, novoSessionId } from "../sessao";

describe("reabertura: nova sessão operacional da Nina", () => {
  const estadoAntigo = normalizarEstado({
    patient: { id: "p1", first_name: "Ana", identified: true, validated: true },
    appointment: {
      specialty: "Cardiologia",
      doctor_name: "Dr. X",
      date: "2026-09-10",
      time: "09:00",
      slot_inicio: "2026-09-10T09:00:00Z",
      slot_confirmed_by_patient: true,
      intent_confirmed: true,
    },
    flow: { stage: "WAITING_FINAL_CONFIRMATION" },
    session_id: "sessao-antiga",
  });

  it("gera um novo identificador de sessão", () => {
    const nova = reabrirSessao(estadoAntigo, "2026-09-05T16:00:00Z");
    expect(nova.session_id).toBeTruthy();
    expect(nova.session_id).not.toBe("sessao-antiga");
    expect(nova.session_started_at).toBe("2026-09-05T16:00:00Z");
  });

  it("não mantém operação pendente (vaga/confirmação/etapa)", () => {
    const nova = reabrirSessao(estadoAntigo);
    expect(nova.appointment.slot_confirmed_by_patient).toBe(false);
    expect(nova.appointment.intent_confirmed).toBe(false);
    expect(nova.appointment.date).toBeNull();
    expect(nova.appointment.time).toBeNull();
    expect(nova.flow.stage).toBe("IDLE");
  });

  it("preserva contexto recente e identificação do paciente", () => {
    const nova = reabrirSessao(estadoAntigo);
    expect(nova.patient.id).toBe("p1");
    expect(nova.patient.first_name).toBe("Ana");
    expect(nova.appointment.specialty).toBe("Cardiologia");
  });

  it("ids de sessão são distintos entre si", () => {
    expect(novoSessionId()).not.toBe(novoSessionId());
  });
});
