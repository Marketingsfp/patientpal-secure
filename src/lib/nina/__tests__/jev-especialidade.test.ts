import { describe, expect, test } from "bun:test";
import { especialidadeAplicavel, opcoesCatalogo, perguntaEspecialidade } from "../jev-especialidade";

describe("Jev Fase 3 — especialidade", () => {
  const opcoes = opcoesCatalogo(
    [{ nome: "USG ABDOMEN" }, { nome: "usg abdomen" }],
    [{ especialidades: [{ nome: "ODONTOLOGIA" }, { nome: "PNEUMOLOGIA" }] }, { especialidades: null }],
  );
  test("junta especialidades e serviços sem repetir", () => {
    expect(opcoes).toEqual(["ODONTOLOGIA", "PNEUMOLOGIA", "USG ABDOMEN"]);
    expect(Object.keys((perguntaEspecialidade(opcoes).especialidade as any).criteria)).toContain("nenhuma");
  });
  test("aplica só com confiança >= 0,8 e opção da lista", () => {
    expect(especialidadeAplicavel({ choice: "ODONTOLOGIA", confidence: 0.9 }, opcoes)).toBe("ODONTOLOGIA");
    expect(especialidadeAplicavel({ choice: "ODONTOLOGIA", confidence: 0.7 }, opcoes)).toBeNull();
    expect(especialidadeAplicavel({ choice: "nenhuma", confidence: 0.99 }, opcoes)).toBeNull();
    expect(especialidadeAplicavel({ choice: "INVENTADA", confidence: 0.99 }, opcoes)).toBeNull();
    expect(especialidadeAplicavel(undefined, opcoes)).toBeNull();
  });
});
