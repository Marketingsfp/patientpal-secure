import { describe, expect, test } from "bun:test";
import { valorDigitado } from "./CargaBateria";

describe("campos numéricos da bateria", () => {
  test("digitação intermediária não prende o valor no mínimo", () => {
    // Apagar "10" e digitar 7: o campo passa por "1" e "", e termina em "7".
    expect(valorDigitado("7", 4, 12)).toBe(7);
    expect(valorDigitado("", 4, 12)).toBe(4);
    expect(valorDigitado("1", 4, 12)).toBe(4);
    expect(valorDigitado("47", 4, 12)).toBe(12);
    expect(valorDigitado("10", 1, 10)).toBe(10);
  });
});
