import { describe, expect, it } from "bun:test";
import {
  extrairCandidatosCodigo,
  gerarCodigoBruto,
  normalizarCodigo,
  variantesTelefone,
} from "./verificacao-v1.server";

describe("código do desafio", () => {
  it("tem prefixo, 4 caracteres e nenhum caractere ambíguo", () => {
    for (let i = 0; i < 300; i++) {
      const c = gerarCodigoBruto();
      expect(c).toMatch(/^MJ-[2-9A-HJ-NP-Z]{4}$/);
      expect(c.slice(3)).not.toMatch(/[O0I1L]/);
    }
  });

  it("normaliza ignorando caixa, espaço e pontuação", () => {
    expect(normalizarCodigo(" mj-4f7k. ")).toBe("MJ4F7K");
  });

  it("acha o código dentro da frase que o paciente enviou", () => {
    expect(extrairCandidatosCodigo("Quero agendar pelo site - codigo MJ-4F7K")).toEqual(["MJ4F7K"]);
    expect(extrairCandidatosCodigo("quero agendar pelo site codigo mj 4f7k")).toEqual(["MJ4F7K"]);
  });

  it("não inventa código em mensagem comum", () => {
    expect(extrairCandidatosCodigo("Bom dia, queria marcar um cardiologista")).toEqual([]);
  });
});

describe("normalização do telefone", () => {
  it("celular com DDI e nono dígito casa com as duas formas", () => {
    expect(variantesTelefone("5521984642531").sort()).toEqual(
      ["21984642531", "2184642531"].sort(),
    );
  });

  it("mesmo resultado sem DDI, com máscara ou com +", () => {
    const esperado = ["21984642531", "2184642531"].sort();
    expect(variantesTelefone("21984642531").sort()).toEqual(esperado);
    expect(variantesTelefone("(21) 98464-2531").sort()).toEqual(esperado);
    expect(variantesTelefone("+55 21 98464-2531").sort()).toEqual(esperado);
  });

  it("fixo/8 dígitos gera também a forma com o nono dígito", () => {
    expect(variantesTelefone("552133334444").sort()).toEqual(
      ["2133334444", "21933334444"].sort(),
    );
  });

  it("não tenta casar número estrangeiro nem número curto demais", () => {
    expect(variantesTelefone("351912345678")).toEqual([]);
    expect(variantesTelefone("984642531")).toEqual([]);
    expect(variantesTelefone("")).toEqual([]);
  });
});
