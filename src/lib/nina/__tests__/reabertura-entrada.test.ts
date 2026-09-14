import { describe, expect, it } from "bun:test";
import { entradaPermiteReabertura } from "../reabertura-entrada";
describe("limite temporal da reabertura no retry", () => {
  const entrada = "2026-09-14T03:00:01.000Z";
  it("fechamento anterior permite retomada da entrada nova", () => {
    expect(entradaPermiteReabertura(entrada, { closed_at: "2026-09-14T03:00:00.000Z" })).toBe(true);
  });
  it("fechamento posterior ou simultâneo preserva a decisão do operador", () => {
    expect(entradaPermiteReabertura(entrada, { closed_at: "2026-09-14T03:00:02.000Z" })).toBe(
      false,
    );
    expect(entradaPermiteReabertura(entrada, { resolved_at: entrada })).toBe(false);
    expect(
      entradaPermiteReabertura(entrada, {
        closed_at: "2026-09-14T03:00:00.000Z",
        resolved_at: "2026-09-14T03:00:02.000Z",
      }),
    ).toBe(false);
  });
  it("datas ausentes ou inválidas não são prova para reabrir", () => {
    expect(entradaPermiteReabertura(entrada, {})).toBe(false);
    expect(entradaPermiteReabertura("", { closed_at: entrada })).toBe(false);
    expect(entradaPermiteReabertura(entrada, { closed_at: "inválida" })).toBe(false);
  });
});
