import { describe, expect, it } from "bun:test";
import { tipoAceitaCaixaAlta } from "@/components/ui/caixa-alta";

/**
 * A clínica pediu que tudo o que a recepção digita apareça em MAIÚSCULO
 * na hora. O risco desse padrão é converter também o que não pode ser
 * convertido — senha, e-mail e endereço de página distinguem maiúscula
 * de minúscula, e campos de data/hora/número são preenchidos pelo
 * próprio navegador. Estes testes prendem essa lista.
 */
describe("caixa alta automática por tipo de campo", () => {
  it("converte campo de texto comum", () => {
    expect(tipoAceitaCaixaAlta(undefined)).toBe(true);
    expect(tipoAceitaCaixaAlta("text")).toBe(true);
    expect(tipoAceitaCaixaAlta("search")).toBe(true);
    expect(tipoAceitaCaixaAlta("tel")).toBe(true);
  });

  it("nunca converte o que é sensível a maiúsculas", () => {
    for (const tipo of ["password", "email", "url"]) {
      expect(tipoAceitaCaixaAlta(tipo)).toBe(false);
    }
  });

  it("nunca converte campo preenchido pelo navegador", () => {
    for (const tipo of [
      "number",
      "date",
      "time",
      "datetime-local",
      "month",
      "week",
      "color",
      "file",
      "range",
      "checkbox",
      "radio",
    ]) {
      expect(tipoAceitaCaixaAlta(tipo)).toBe(false);
    }
  });
});
