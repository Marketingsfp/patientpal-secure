import { describe, expect, it } from "bun:test";
import { totaisAproximadosNaoOptante } from "./nfse-tributos-aproximados";

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
