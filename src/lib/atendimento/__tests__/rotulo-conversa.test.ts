import { describe, expect, it } from "bun:test";
import { SEM_NOME, nomeConversa, tituloConversa } from "../rotulo-conversa";

describe("identificação da conversa", () => {
  it("usa o nome do paciente vinculado antes de qualquer outra coisa", () => {
    expect(
      nomeConversa({
        pacientes: { nome: "Maria da Silva" },
        contato_nome: "Zap da Maria",
        contato_telefone: "5588999990000",
      }),
    ).toBe("Maria da Silva");
  });

  it("usa o nome do contato quando não há paciente vinculado", () => {
    expect(nomeConversa({ contato_nome: "João Pedro", contato_telefone: "88999990000" })).toBe(
      "João Pedro",
    );
  });

  it("telefone gravado no campo de nome não vira nome", () => {
    expect(nomeConversa({ contato_nome: "5588999990000", contato_telefone: "5588999990000" })).toBe(
      null,
    );
    expect(nomeConversa({ contato_nome: "(88) 99999-0000", contato_telefone: "88999990000" })).toBe(
      null,
    );
  });

  it("valores vazios ou inválidos não viram nome", () => {
    for (const v of ["", "   ", "undefined", "null", "—"]) {
      expect(nomeConversa({ contato_nome: v, contato_telefone: "88999990000" })).toBe(null);
    }
  });

  it("sem nome cadastrado o título é o texto provisório", () => {
    expect(tituloConversa({ contato_telefone: "88999990000" })).toBe(SEM_NOME);
    expect(tituloConversa(null)).toBe(SEM_NOME);
  });

  it("nome atualizado depois passa a valer sem mexer no telefone", () => {
    const antes = { contato_nome: null, contato_telefone: "88999990000", pacientes: null };
    const depois = { ...antes, pacientes: { nome: "Ana Beatriz Nogueira dos Santos" } };
    expect(tituloConversa(antes)).toBe(SEM_NOME);
    expect(tituloConversa(depois)).toBe("Ana Beatriz Nogueira dos Santos");
    expect(depois.contato_telefone).toBe("88999990000");
  });
});
