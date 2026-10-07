import { describe, expect, it } from "bun:test";
import { totaisAproximadosNaoOptante, totaisAproximadosSimples } from "./nfse-tributos-aproximados";

describe("totaisAproximadosNaoOptante", () => {
  it("municipais = ISS da nota, mesmo sem percentual federal cadastrado", () => {
    expect(
      totaisAproximadosNaoOptante({ valorServicos: 363, valorIss: 10.89, pctFederais: null }),
    ).toEqual({
      valor_total_tributos_federais: 0,
      valor_total_tributos_estaduais: 0,
      valor_total_tributos_municipais: 10.89,
    });
  });

  it("federais usam o percentual da contabilidade", () => {
    expect(
      totaisAproximadosNaoOptante({ valorServicos: 363, valorIss: 10.89, pctFederais: 11.33 })
        .valor_total_tributos_federais,
    ).toBe(41.13);
  });

  it("percentual inválido ou zero não gera valor federal", () => {
    expect(
      totaisAproximadosNaoOptante({ valorServicos: 100, valorIss: 3, pctFederais: 0 })
        .valor_total_tributos_federais,
    ).toBe(0);
  });
});

describe("totaisAproximadosSimples", () => {
  it("ISS fora do Simples: federais, estaduais e municipais em %, como no portal", () => {
    expect(
      totaisAproximadosSimples({ regimeApuracaoSn: 2, pctTotTribSN: 15.45, aliquotaIss: 0.05 }),
    ).toEqual({
      percentual_total_tributos_federais: 15.45,
      percentual_total_tributos_estaduais: 0,
      percentual_total_tributos_municipais: 5,
    });
  });

  it("tudo no Simples: segue o percentual único (pTotTribSN)", () => {
    expect(
      totaisAproximadosSimples({ regimeApuracaoSn: 1, pctTotTribSN: 6, aliquotaIss: 0.02 }),
    ).toEqual({ percentual_total_tributos_simples_nacional: 6 });
  });
});
