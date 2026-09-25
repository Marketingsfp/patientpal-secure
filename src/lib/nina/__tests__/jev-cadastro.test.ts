import { describe, expect, test } from "bun:test";
import { estadoCadastro, normalizarNome, perguntaCadastro, sugestaoCadastro } from "../jev-cadastro";

const c = [
  { id: "a", nome: "TESTE Maria", data_nascimento: "1990-01-01", telefone: "11999990001" },
  { id: "b", nome: "TESTE Maria", data_nascimento: null, telefone: "11999990001" },
];

describe("Jev Fase 4 — cadastro (só sugestão)", () => {
  test("normaliza nome como o banco", () => {
    expect(normalizarNome("  José   da  Silva ")).toBe("JOSE DA SILVA");
  });
  test("monta rótulos sem expor ids e inclui empate", () => {
    const crit = Object.keys((perguntaCadastro(c).cadastro as any).criteria);
    expect(crit).toEqual(["cadastro_1", "cadastro_2", "empate"]);
    expect(JSON.stringify(estadoCadastro({ nome: "x", data_nascimento: "y", telefone: "z" }, c))).not.toContain('"a"');
  });
  test("sugere só com confiança >= 0,8 e rótulo válido", () => {
    expect(sugestaoCadastro({ choice: "cadastro_2", confidence: 0.9 }, c)).toBe("b");
    expect(sugestaoCadastro({ choice: "cadastro_2", confidence: 0.6 }, c)).toBeNull();
    expect(sugestaoCadastro({ choice: "empate", confidence: 0.99 }, c)).toBeNull();
    expect(sugestaoCadastro({ choice: "cadastro_9", confidence: 0.99 }, c)).toBeNull();
    expect(sugestaoCadastro(undefined, c)).toBeNull();
  });
});
