import { describe, expect, it } from "bun:test";
import { normalizarTelefone } from "./numero";

// Números fictícios, só no formato que a API devolve.
describe("normalizarTelefone", () => {
  it("+55 com 13 dígitos fica como está", () => {
    expect(normalizarTelefone("+5527999990000")).toEqual({
      e164: "+5527999990000",
      original: "+5527999990000",
    });
  });
  it("10 dígitos sem DDI ganha 55", () => {
    expect(normalizarTelefone("2733330000").e164).toBe("+552733330000");
  });
  it("11 dígitos sem DDI ganha 55", () => {
    expect(normalizarTelefone("27999990000").e164).toBe("+5527999990000");
  });
  it("+ com 12 dígitos (55 + fixo) fica como está", () => {
    expect(normalizarTelefone("+552733330000").e164).toBe("+552733330000");
  });
  it("formato desconhecido devolve original e e164 nulo", () => {
    expect(normalizarTelefone("1234")).toEqual({ e164: null, original: "1234" });
    expect(normalizarTelefone(null)).toEqual({ e164: null, original: "" });
  });
});
