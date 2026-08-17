import { describe, expect, it } from "bun:test";
import { proximoValorMoeda, valorEmCentavos } from "./moeda-mascara";

describe("valorEmCentavos", () => {
  it("converte o valor guardado em centavos", () => {
    expect(valorEmCentavos("")).toBe(0);
    expect(valorEmCentavos("0.00")).toBe(0);
    expect(valorEmCentavos("150.00")).toBe(15000);
    expect(valorEmCentavos("0.05")).toBe(5);
  });
});

describe("proximoValorMoeda", () => {
  it("monta o valor da direita para a esquerda", () => {
    expect(proximoValorMoeda("", "1")).toBe("0.01");
    expect(proximoValorMoeda("0.01", "R$ 0,015")).toBe("0.15");
    expect(proximoValorMoeda("", "R$ 15000")).toBe("150.00");
  });

  it("apagar tudo deixa o campo vazio", () => {
    expect(proximoValorMoeda("150.00", "")).toBe("");
  });

  it("apagar um campo que ja estava zerado deixa vazio", () => {
    // Era o caso que prendia o usuario: o backspace tirava um digito, sobravam
    // zeros e a mascara remontava R$ 0,00 para sempre.
    expect(proximoValorMoeda("0.00", "R$ 0,0")).toBe("");
    expect(proximoValorMoeda("0.00", "R$ 0,00")).toBe("");
  });

  it("digitar zero com o campo vazio vale como zero de proposito", () => {
    expect(proximoValorMoeda("", "0")).toBe("0.00");
    expect(proximoValorMoeda("", "R$ 0,00")).toBe("0.00");
  });

  it("apagar centavos de um valor diferente de zero passa por zero antes de esvaziar", () => {
    expect(proximoValorMoeda("0.05", "R$ 0,0")).toBe("0.00");
    expect(proximoValorMoeda("0.00", "R$ 0,0")).toBe("");
  });

  it("apagar digitos de um valor cheio nao esvazia sozinho", () => {
    expect(proximoValorMoeda("150.00", "R$ 150,0")).toBe("15.00");
    expect(proximoValorMoeda("15.00", "R$ 15,0")).toBe("1.50");
  });
});
