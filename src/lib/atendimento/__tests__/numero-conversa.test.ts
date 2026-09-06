import { describe, expect, it } from "bun:test";
import { formatarNumeroConversa, interpretarBuscaConversa } from "../numero-conversa";

describe("formatarNumeroConversa", () => {
  it("mostra sempre no formato #1342", () => {
    expect(formatarNumeroConversa(1342)).toBe("#1342");
  });
  it("não inventa número quando não existe", () => {
    expect(formatarNumeroConversa(null)).toBeNull();
    expect(formatarNumeroConversa(undefined)).toBeNull();
    expect(formatarNumeroConversa(0)).toBeNull();
    expect(formatarNumeroConversa(-5)).toBeNull();
  });
});

describe("interpretarBuscaConversa", () => {
  it("#1342 é busca exata pelo número", () => {
    expect(interpretarBuscaConversa("#1342")).toEqual({
      texto: "",
      numero: 1342,
      exigeNumero: true,
    });
  });

  it("espaços em volta não atrapalham", () => {
    expect(interpretarBuscaConversa("  #1342  ").numero).toBe(1342);
  });

  it("#134 não vira busca parcial de #1342", () => {
    const r = interpretarBuscaConversa("#134");
    expect(r.numero).toBe(134);
    expect(r.exigeNumero).toBe(true);
  });

  it("1342 sem # preserva a busca por nome/telefone e destaca o número", () => {
    expect(interpretarBuscaConversa("1342")).toEqual({
      texto: "1342",
      numero: 1342,
      exigeNumero: false,
    });
  });

  it("nome continua sendo busca de texto", () => {
    expect(interpretarBuscaConversa("Maria")).toEqual({
      texto: "Maria",
      numero: null,
      exigeNumero: false,
    });
  });

  it("telefone continua sendo busca de texto", () => {
    const r = interpretarBuscaConversa("5535998877665");
    expect(r.texto).toBe("5535998877665");
    expect(r.exigeNumero).toBe(false);
  });

  it("entrada inválida não quebra a tela", () => {
    expect(interpretarBuscaConversa("#")).toEqual({ texto: "", numero: null, exigeNumero: false });
    expect(interpretarBuscaConversa("#abc")).toEqual({
      texto: "abc",
      numero: null,
      exigeNumero: false,
    });
    expect(interpretarBuscaConversa("#0").numero).toBeNull();
    expect(interpretarBuscaConversa(null)).toEqual({
      texto: "",
      numero: null,
      exigeNumero: false,
    });
  });
});
