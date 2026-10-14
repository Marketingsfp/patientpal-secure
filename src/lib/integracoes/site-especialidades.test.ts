import { describe, expect, test } from "bun:test";
import { idsDesligados, medicoLiberado } from "./site-especialidades";

describe("site — especialidades liberadas", () => {
  test("sem linha em nenhuma tabela, nada é desligado", () => {
    expect(idsDesligados([], undefined).size).toBe(0);
  });
  test("desligada em qualquer das duas tabelas conta como desligada", () => {
    const s = idsDesligados(
      [{ especialidade_id: "a", ativo: false }, { especialidade_id: "b", ativo: true }],
      [{ especialidade_id: "c", ativo: false }],
    );
    expect([...s].sort()).toEqual(["a", "c"]);
  });
  test("médico com todas as especialidades desligadas some", () => {
    expect(medicoLiberado(["a", "c"], new Set(["a", "c"]))).toBe(false);
  });
  test("médico com ao menos uma especialidade ligada continua", () => {
    expect(medicoLiberado(["a", "b"], new Set(["a"]))).toBe(true);
  });
  test("médico sem especialidade continua aparecendo", () => {
    expect(medicoLiberado([null], new Set(["a"]))).toBe(true);
  });
});
