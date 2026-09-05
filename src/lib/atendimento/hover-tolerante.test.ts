import { describe, expect, test } from "bun:test";
import { TOLERANCIA_PADRAO, dentroComTolerancia } from "./hover-tolerante";

const rect = { left: 100, right: 400, top: 50, bottom: 600 };

describe("zona de tolerância da sidebar", () => {
  test("Teste 1 — 10px fora da borda direita ainda conta como dentro", () => {
    expect(dentroComTolerancia(rect, 410, 300, TOLERANCIA_PADRAO)).toBe(true);
  });

  test("30px à direita (região da scrollbar) ainda conta como dentro", () => {
    expect(dentroComTolerancia(rect, 430, 300, TOLERANCIA_PADRAO)).toBe(true);
  });

  test("Teste 3 — saída real à direita fica fora", () => {
    expect(dentroComTolerancia(rect, 460, 300, TOLERANCIA_PADRAO)).toBe(false);
  });

  test("tolerância menor nas demais bordas", () => {
    expect(dentroComTolerancia(rect, 300, 610, TOLERANCIA_PADRAO)).toBe(true);
    expect(dentroComTolerancia(rect, 300, 640, TOLERANCIA_PADRAO)).toBe(false);
    expect(dentroComTolerancia(rect, 90, 300, TOLERANCIA_PADRAO)).toBe(true);
    expect(dentroComTolerancia(rect, 70, 300, TOLERANCIA_PADRAO)).toBe(false);
  });

  test("dentro do painel sempre conta", () => {
    expect(dentroComTolerancia(rect, 250, 300, TOLERANCIA_PADRAO)).toBe(true);
  });
});
