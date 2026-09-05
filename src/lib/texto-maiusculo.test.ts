import { describe, expect, it } from "bun:test";
import { maiusculoDigitacao, maiusculoParaBanco } from "./texto-maiusculo";

describe("maiusculoDigitacao", () => {
  it("converte para caixa alta preservando os espaços em digitação", () => {
    // O espaço do fim precisa sobreviver: é o que a recepcionista acabou de
    // digitar antes do sobrenome. Cortá-lo aqui impediria de continuar o nome.
    expect(maiusculoDigitacao("maria da silva ")).toBe("MARIA DA SILVA ");
  });

  it("preserva os acentos, que só são removidos ao gravar no banco", () => {
    expect(maiusculoDigitacao("joão conceição")).toBe("JOÃO CONCEIÇÃO");
  });
});

describe("maiusculoParaBanco", () => {
  it("tira espaços das pontas e reduz espaços repetidos do meio", () => {
    expect(maiusculoParaBanco("  maria   silva  ")).toBe("MARIA SILVA");
  });

  it("faz dois cadastros com espaçamento diferente virarem o mesmo texto", () => {
    expect(maiusculoParaBanco("MARIA  SILVA")).toBe(maiusculoParaBanco("maria silva"));
  });

  it("devolve string vazia quando só havia espaços", () => {
    expect(maiusculoParaBanco("   ")).toBe("");
  });
});
