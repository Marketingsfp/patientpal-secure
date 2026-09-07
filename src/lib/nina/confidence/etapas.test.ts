import { describe, expect, it } from "bun:test";
import { aplicarEtapa, etapaAtinge, etapaDeFlag, type EtapaAtivacao } from "./etapas";
import type { ResultadoConfianca } from "./types";

function resultado(p: Partial<ResultadoConfianca>): ResultadoConfianca {
  return {
    score: 95,
    level: "HIGH",
    decision: "ALLOW",
    blockers: [],
    hardBlockers: [],
    checks: [],
    evidence: {
      categorias: [],
      fontesUteis: 1,
      fontesPublicadas: 1,
      ferramentasExecutadas: 1,
      ferramentasComFalha: 0,
      camposFaltantes: [],
      motivos: [],
    },
    ...p,
  } as ResultadoConfianca;
}

describe("FASE 8 — ativação progressiva", () => {
  it("etapa A não interfere em nenhuma decisão", () => {
    for (const d of ["ALLOW", "CLARIFY", "HANDOFF", "BLOCK_ACTION"] as const) {
      const a = aplicarEtapa(resultado({ decision: d, level: "LOW" }), "A");
      expect(a.decisaoEfetiva).toBe("ALLOW");
      expect(a.interferiu).toBe(false);
      expect(a.decisaoMotor).toBe(d);
    }
  });

  it("etapa B aplica handoff e bloqueio, mas ainda não esclarece", () => {
    expect(aplicarEtapa(resultado({ decision: "HANDOFF" }), "B").decisaoEfetiva).toBe("HANDOFF");
    expect(aplicarEtapa(resultado({ decision: "BLOCK_ACTION" }), "B").decisaoEfetiva).toBe(
      "BLOCK_ACTION",
    );
    const c = aplicarEtapa(resultado({ decision: "CLARIFY", level: "MEDIUM" }), "B");
    expect(c.decisaoEfetiva).toBe("ALLOW");
    expect(c.interferiu).toBe(false);
  });

  it("etapa C aplica também o esclarecimento", () => {
    const c = aplicarEtapa(resultado({ decision: "CLARIFY", level: "MEDIUM" }), "C");
    expect(c.decisaoEfetiva).toBe("CLARIFY");
    expect(c.interferiu).toBe(true);
  });

  it("etapa C não endurece agendamento liberado", () => {
    const r = resultado({
      decision: "ALLOW",
      level: "MEDIUM",
      evidence: { ...resultado({}).evidence, categorias: ["agendamento"] },
    });
    expect(aplicarEtapa(r, "C").decisaoEfetiva).toBe("ALLOW");
  });

  it("etapa D exige confiança alta para agendar", () => {
    const r = resultado({
      decision: "ALLOW",
      level: "MEDIUM",
      evidence: { ...resultado({}).evidence, categorias: ["agendamento"] },
    });
    const d = aplicarEtapa(r, "D");
    expect(d.decisaoEfetiva).toBe("HANDOFF");
    expect(d.motivoEtapa).toBe("agendamento_sem_confianca_alta");
  });

  it("etapa D bloqueia agendamento com bloqueador absoluto", () => {
    const r = resultado({
      decision: "ALLOW",
      level: "HIGH",
      hardBlockers: ["INCONSISTENT_SCHEDULE"],
      evidence: { ...resultado({}).evidence, categorias: ["disponibilidade"] },
    });
    const d = aplicarEtapa(r, "D");
    expect(d.decisaoEfetiva).toBe("BLOCK_ACTION");
    expect(d.motivoEtapa).toBe("agendamento_com_bloqueador");
  });

  it("etapa D não altera pergunta de preço com alta confiança", () => {
    const r = resultado({
      decision: "ALLOW",
      level: "HIGH",
      evidence: { ...resultado({}).evidence, categorias: ["preco"] },
    });
    expect(aplicarEtapa(r, "D").decisaoEfetiva).toBe("ALLOW");
  });

  it("resolve a etapa a partir da configuração, com padrão seguro", () => {
    expect(etapaDeFlag(undefined)).toBe("A");
    expect(etapaDeFlag("x")).toBe("A");
    expect(etapaDeFlag("b")).toBe("B");
    expect(etapaDeFlag("D")).toBe("D");
    expect(etapaDeFlag(undefined, { enforceLegado: true })).toBe("C");
    expect(etapaDeFlag("B", { enforceLegado: true })).toBe("B");
  });

  it("cada etapa contém a anterior", () => {
    const ordem: EtapaAtivacao[] = ["A", "B", "C", "D"];
    for (let i = 0; i < ordem.length; i++) {
      for (let j = 0; j <= i; j++) expect(etapaAtinge(ordem[i]!, ordem[j]!)).toBe(true);
    }
    expect(etapaAtinge("B", "C")).toBe(false);
  });
});
