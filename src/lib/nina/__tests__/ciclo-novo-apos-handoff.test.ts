/**
 * FASE 3 — novo ciclo limpo após handoff (regras puras).
 */
import { describe, expect, it } from "bun:test";
import {
  cicloAtivo,
  cicloAtivoDoLead,
  divisorFimCiclo,
  divisorInicioCiclo,
  estadoCiclo,
  novoNinaSessionId,
  patchEncerrarCiclo,
} from "../ciclo-teste";
import { novaSessao, reabrirSessao } from "../sessao";
import { normalizarEstado } from "../fluxo-estado-normalizar";

describe("novo ciclo após handoff", () => {
  it("ciclo encerrado por handoff deixa o lead sem ciclo ativo", () => {
    const patch = patchEncerrarCiclo("handoff_humano");
    expect(patch.status).toBe("encerrado_handoff");
    expect(patch.end_reason).toBe("handoff_humano");
    expect(estadoCiclo(patch.status)).toBe("completed_handoff");
    expect(cicloAtivo(patch.status)).toBe(false);
    const ciclos = [{ id: "c1", lead_id: "L1", status: patch.status, ended_at: patch.ended_at }];
    expect(cicloAtivoDoLead(ciclos, "L1")).toBeNull();
  });

  it("cada ciclo tem sessão de memória própria", () => {
    expect(novoNinaSessionId("c1")).not.toBe(novoNinaSessionId("c2"));
  });

  it("memória do novo ciclo começa vazia e pede apresentação", () => {
    const estado = normalizarEstado(null);
    expect(estado.greeting_completed).toBe(false);
    expect(estado.flow.stage === "IDLE" || estado.flow.stage === "GREETING").toBe(true);
    expect(estado.appointment.doctor_name).toBeNull();
    expect(estado.appointment.specialty).toBeNull();
    expect(estado.appointment.slot_inicio).toBeNull();
    expect(estado.appointment.intent_confirmed).toBe(false);
  });

  it("nada transacional do ciclo anterior sobrevive", () => {
    const anterior = normalizarEstado({
      patient: { name: "João" },
      appointment: {
        doctor_name: "Dr. Carlos",
        specialty: "Cardiologia",
        date: "2026-09-10",
        time: "10:00",
        slot_inicio: "2026-09-10T10:00:00Z",
        slot_confirmed_by_patient: true,
        intent_confirmed: true,
      },
      flow: { stage: "WAITING_FINAL_CONFIRMATION" },
      greeting_completed: true,
    });
    for (const nova of [novaSessao(anterior), reabrirSessao(anterior)]) {
      expect(nova.appointment.date).toBeNull();
      expect(nova.appointment.time).toBeNull();
      expect(nova.appointment.slot_inicio).toBeNull();
      expect(nova.appointment.slot_confirmed_by_patient).toBe(false);
      expect(nova.appointment.intent_confirmed).toBe(false);
      expect(nova.flow.stage === "GREETING" || nova.flow.stage === "IDLE").toBe(true);
      expect(nova.greeting_completed).toBe(false);
    }
    // Sessão totalmente nova (ciclo novo) não carrega médico/especialidade.
    const nova = novaSessao(anterior);
    expect(nova.appointment.doctor_name).toBeNull();
    expect(nova.appointment.specialty).toBeNull();
  });

  it("divisores identificam fim e início de ciclo", () => {
    expect(divisorFimCiclo(19, "handoff_humano")).toBe(
      "───── Ciclo 19 encerrado — handoff para atendimento humano ─────",
    );
    expect(divisorInicioCiclo(20)).toBe("───── Ciclo 20 iniciado — nova sessão da Nina ─────");
  });
});
