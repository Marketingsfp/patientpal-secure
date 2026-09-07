import { describe, expect, test } from "bun:test";
import { aplicarModo, modoDeFlag } from "./shadow";
import { CENARIOS_SHADOW, executarMatrizShadow, resumoMatriz } from "./shadow-matriz";
import type { ResultadoConfianca } from "./types";

const fake = (decision: ResultadoConfianca["decision"]) =>
  ({ decision, score: 50, level: "LOW", blockers: [], hardBlockers: [], evidence: {} }) as unknown as ResultadoConfianca;

describe("shadow mode", () => {
  test("shadow nunca interfere na resposta", () => {
    for (const d of ["ALLOW", "CLARIFY", "HANDOFF", "BLOCK_ACTION"] as const) {
      const r = aplicarModo(fake(d), "shadow");
      expect(r.decisaoEfetiva).toBe("ALLOW");
      expect(r.interferiu).toBe(false);
      expect(r.decisaoMotor).toBe(d);
    }
  });

  test("enforce aplica a decisão do motor", () => {
    const r = aplicarModo(fake("HANDOFF"), "enforce");
    expect(r.decisaoEfetiva).toBe("HANDOFF");
    expect(r.interferiu).toBe(true);
    expect(r.teriaPermitido).toBe(false);
  });

  test("modo padrão é shadow sem flag ligada", () => {
    expect(modoDeFlag(undefined)).toBe("shadow");
    expect(modoDeFlag(false)).toBe("shadow");
    expect(modoDeFlag(true)).toBe("enforce");
  });
});

describe("matriz de homologação", () => {
  const linhas = executarMatrizShadow("shadow");

  test("cobre os 15 cenários pedidos", () => {
    expect(CENARIOS_SHADOW.length).toBe(15);
    expect(linhas.length).toBe(15);
  });

  test("em shadow nenhum cenário altera o comportamento da Nina", () => {
    const r = resumoMatriz(linhas);
    expect(r.interferiu).toBe(0);
    expect(linhas.every((l) => l.resultadoReal === "ALLOW")).toBe(true);
  });

  test("matriz sem regressões: todo cenário bate com o esperado", () => {
    const falhas = linhas.filter((l) => l.status === "FAIL").map((l) => `${l.id}:${l.decisao}`);
    expect(falhas).toEqual([]);
  });

  test("cenários de risco seriam bloqueados em enforce", () => {
    const enforce = executarMatrizShadow("enforce");
    const semCatalogo = enforce.find((l) => l.id === "preco-inexistente");
    expect(semCatalogo?.teriaPermitido).toBe(false);
    expect(resumoMatriz(enforce).teriaBloqueado).toBeGreaterThan(0);
  });
});
