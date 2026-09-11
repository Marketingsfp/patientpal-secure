import { describe, expect, it } from "bun:test";
import { ehRevisaoGratuita, normalizarNomeServico } from "./revisao-gratuita";

const ZERADO = {
  valor_padrao: 0,
  valor_dinheiro: 0,
  valor_dinheiro_pix: null,
  valor_pix: null,
  valor_cartao: 0,
  valor_cartao_credito: null,
  valor_cartao_debito: null,
};

describe("normalizarNomeServico", () => {
  it("tira o sufixo de especialidade, acento e caixa", () => {
    expect(normalizarNomeServico("REVISÃO (GINECOLOGIA)")).toBe("REVISAO");
  });
});

describe("ehRevisaoGratuita", () => {
  it("REVISAO (GINECOLOGIA) zerada é revisão gratuita", () => {
    expect(ehRevisaoGratuita("REVISAO (GINECOLOGIA)", ZERADO)).toBe(true);
  });

  it("REVISÃO com acento e zerada é revisão gratuita", () => {
    expect(ehRevisaoGratuita("REVISÃO", ZERADO)).toBe(true);
  });

  it("REVISAO 50% não é (nome diferente)", () => {
    expect(ehRevisaoGratuita("REVISAO 50%", ZERADO)).toBe(false);
    expect(ehRevisaoGratuita("REVISAO 50% DIFERENCIADA", { ...ZERADO, valor_padrao: 80 })).toBe(
      false,
    );
  });

  it("REVISAO com preço maior que zero não é gratuita", () => {
    expect(ehRevisaoGratuita("REVISAO", { ...ZERADO, valor_dinheiro: 55 })).toBe(false);
  });

  it("CONSULTA 110 E 130 zerada não é revisão", () => {
    expect(ehRevisaoGratuita("CONSULTA 110 E 130", ZERADO)).toBe(false);
  });

  it("CONSULTA DE RETORNO não é revisão", () => {
    expect(ehRevisaoGratuita("CONSULTA DE RETORNO", { ...ZERADO, valor_padrao: 45 })).toBe(false);
    expect(ehRevisaoGratuita("CONSULTA DE RETORNO", ZERADO)).toBe(false);
  });

  it("RETORNO zerado é revisão gratuita", () => {
    expect(ehRevisaoGratuita("RETORNO (ORTOPEDIA)", ZERADO)).toBe(true);
  });
});
