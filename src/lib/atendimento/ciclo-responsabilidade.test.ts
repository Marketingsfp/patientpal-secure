import { describe, expect, it } from "vitest";
import {
  CICLO_PATCH,
  derivarResponsavel,
  inconsistenciasCiclo,
  ninaResponde,
} from "./ciclo-responsabilidade";

describe("ciclo de responsabilidade da conversa", () => {
  it("conversa nova (inexistente) é da Nina", () => {
    expect(derivarResponsavel(null)).toBe("NINA");
    expect(ninaResponde(null)).toBe(true);
  });

  it("conversa aberta com a Nina", () => {
    const c = { owner_type: "AI", ai_enabled: true, status: "active", atribuida_user_id: null };
    expect(derivarResponsavel(c)).toBe("NINA");
    expect(ninaResponde(c)).toBe(true);
  });

  it("fila humana após handoff: Nina calada", () => {
    const c = { owner_type: "NONE", ai_enabled: false, status: "waiting", atribuida_user_id: null };
    expect(derivarResponsavel(c)).toBe("FILA_HUMANA");
    expect(ninaResponde(c)).toBe(false);
  });

  it("humano atendendo: nova mensagem continua com o humano", () => {
    const c = { owner_type: "HUMAN", ai_enabled: false, status: "active", atribuida_user_id: "u1" };
    expect(derivarResponsavel(c)).toBe("HUMANO");
    expect(ninaResponde(c)).toBe(false);
  });

  it("resolvida encerra a sessão e libera nova sessão da Nina", () => {
    for (const status of ["closed", "finished", "resolvida"]) {
      const c = { owner_type: "AI", ai_enabled: true, status, atribuida_user_id: null };
      expect(derivarResponsavel(c)).toBe("RESOLVIDA");
      expect(ninaResponde(c)).toBe(true);
    }
  });

  it("status encerrado vence owner gravado (sem ambiguidade)", () => {
    const c = { owner_type: "HUMAN", ai_enabled: false, status: "closed", atribuida_user_id: "u1" };
    expect(derivarResponsavel(c)).toBe("RESOLVIDA");
    expect(inconsistenciasCiclo(c)).toContain("conversa resolvida ainda com atendente atribuído");
  });

  it("owner AI com atendente atribuído resolve para HUMANO", () => {
    const c = { owner_type: "AI", ai_enabled: true, status: "active", atribuida_user_id: "u9" };
    expect(derivarResponsavel(c)).toBe("HUMANO");
    expect(ninaResponde(c)).toBe(false);
  });

  it("owner AI com IA desligada não vira Nina", () => {
    const c = { owner_type: "AI", ai_enabled: false, status: "active", atribuida_user_id: null };
    expect(derivarResponsavel(c)).toBe("FILA_HUMANA");
    expect(inconsistenciasCiclo(c)).toContain("owner AI com IA desligada (responsável indefinido)");
  });

  it("patches canônicos não geram inconsistência", () => {
    expect(inconsistenciasCiclo({ ...CICLO_PATCH.nina(), status: "active" })).toEqual([]);
    expect(inconsistenciasCiclo({ ...CICLO_PATCH.filaHumana(), status: "waiting" })).toEqual([]);
    expect(inconsistenciasCiclo({ ...CICLO_PATCH.humano("u1"), status: "active" })).toEqual([]);
    expect(inconsistenciasCiclo({ ...CICLO_PATCH.resolvida(), status: "closed" })).toEqual([]);
  });
});
