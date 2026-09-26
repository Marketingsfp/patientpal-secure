/**
 * 26/09/2026: "Resolver / Reiniciar teste" apagava o agendamento de teste. Como
 * a Nina grava POR CIMA da vaga livre, a vaga sumia da agenda real (3 vagas
 * perdidas nas simulações dos 41 profissionais). O reset agora devolve a vaga.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const codigo = readFileSync(new URL("../teste-console.server.ts", import.meta.url), "utf8");

describe("reset da homologação devolve a vaga", () => {
  test("não apaga registros da agenda", () => {
    expect(codigo).not.toMatch(/from\("agendamentos"\)\s*\.delete\(\)/);
  });

  test("usa a mesma devolução da bateria (vaga volta a DISPONIVEL)", () => {
    expect(codigo).toContain("devolverVagasDaConversa");
  });
});
