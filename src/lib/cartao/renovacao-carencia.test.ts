import { describe, expect, test } from "bun:test";
import { limiteJanelaRenovacao, renovacaoReiniciaCarencia } from "./renovacao-carencia";

describe("limiteJanelaRenovacao", () => {
  test("soma 3 meses", () => {
    expect(limiteJanelaRenovacao("2026-01-15")).toBe("2026-04-15");
  });
  test("vira o ano", () => {
    expect(limiteJanelaRenovacao("2026-11-10")).toBe("2027-02-10");
  });
  test("prende no último dia do mês, como o Postgres", () => {
    expect(limiteJanelaRenovacao("2026-11-30")).toBe("2027-02-28");
  });
});

describe("renovacaoReiniciaCarencia", () => {
  test("renovação no último dia da janela mantém a carência", () => {
    expect(renovacaoReiniciaCarencia("2026-01-15", "2026-04-15")).toBe(false);
  });
  test("um dia depois da janela reinicia", () => {
    expect(renovacaoReiniciaCarencia("2026-01-15", "2026-04-16")).toBe(true);
  });
  test("renovação antes do fim do contrato não reinicia", () => {
    expect(renovacaoReiniciaCarencia("2026-12-01", "2026-10-15")).toBe(false);
  });
  test("sem data de fim não reinicia", () => {
    expect(renovacaoReiniciaCarencia(null, "2026-10-15")).toBe(false);
  });
});
