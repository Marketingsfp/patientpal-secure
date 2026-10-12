import { describe, it, expect } from "bun:test";
import { estadoVazio } from "../fluxo-estado.server";
import { faltaParaConsultarAgenda } from "../atendimento-fase4";

function estadoCom(appointment: Record<string, unknown>, patient: Record<string, unknown> = {}) {
  const base = estadoVazio();
  return {
    ...base,
    patient: { ...base.patient, ...patient },
    appointment: { ...base.appointment, ...appointment },
  };
}

describe("fase 4 — dados mínimos", () => {
  it("aponta o que falta antes de consultar a agenda", () => {
    expect(faltaParaConsultarAgenda(estadoVazio())).toContain("procedimento");
    expect(faltaParaConsultarAgenda(estadoVazio())).toContain("preferencia_data");
  });

  it("não reclama quando já há especialidade e data", () => {
    const e = estadoCom({ specialty: "Cardiologia", date: "2026-09-08" });
    expect(faltaParaConsultarAgenda(e)).toEqual([]);
  });
});

describe("fase 4 — prompt", () => {
  const estado = estadoCom(
    {
      specialty: "Cardiologia",
      doctor_name: "Dr. João",
      date: "2026-09-08",
      time: "09:00",
    },
    { first_name: "João" },
  );
});
