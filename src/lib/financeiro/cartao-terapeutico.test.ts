import { describe, expect, it } from "bun:test";

import {
  NOME_REPASSE_CARTAO_TERAPEUTICO,
  ehServicoCartaoTerapeutico,
  nomeRepasseExibido,
} from "./cartao-terapeutico";

describe("ehServicoCartaoTerapeutico", () => {
  const doProduto = [
    "CONSULTA TERAPEUTICA 1 (PSICOLOGIA)",
    "CONSULTA TERAPEUTICA 2 (PSICOLOGIA)",
    "AVALIACAO TERAPEUTICA (PSICOLOGIA)",
    "CARTAO TERAPEUTICO",
    "CONSULTA TERAPÊUTICA 1",
  ];
  const fora = [
    "PSICOLOGIA",
    "CONSULTA (PSICOLOGIA)",
    "FISIOTERAPIA",
    "FISIOTERAPIA (5 SESSOES) (FISIOTERAPIA)",
    null,
    "",
  ];

  for (const nome of doProduto) {
    it(`reconhece "${nome}"`, () => {
      expect(ehServicoCartaoTerapeutico(nome)).toBe(true);
    });
  }

  for (const nome of fora) {
    it(`não reconhece ${JSON.stringify(nome)}`, () => {
      expect(ehServicoCartaoTerapeutico(nome)).toBe(false);
    });
  }
});

describe("nomeRepasseExibido", () => {
  it("usa o nome do produto no Cartão Terapêutico", () => {
    expect(nomeRepasseExibido("CONSULTA TERAPEUTICA 1 (PSICOLOGIA)", "ANA PSICOLOGA")).toBe(
      NOME_REPASSE_CARTAO_TERAPEUTICO,
    );
    expect(nomeRepasseExibido("AVALIACAO TERAPEUTICA (PSICOLOGIA)", "ANA PSICOLOGA")).toBe(
      "CARTÃO TERAPÊUTICO",
    );
  });

  it("mantém o nome da profissional nos atendimentos normais", () => {
    expect(nomeRepasseExibido("CONSULTA (PSICOLOGIA)", "ANA PSICOLOGA")).toBe("ANA PSICOLOGA");
    expect(nomeRepasseExibido("FISIOTERAPIA", "BIA FISIO")).toBe("BIA FISIO");
    expect(nomeRepasseExibido(null, "—")).toBe("—");
  });
});
