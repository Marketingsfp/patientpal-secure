import { describe, expect, it } from "bun:test";
import { totaisAproximadosNaoOptante, totaisAproximadosSimples } from "./nfse-tributos-aproximados";

describe("totaisAproximadosNaoOptante", () => {
  it("percentuais por esfera, como a nota da MA emitida no portal", () => {
    expect(totaisAproximadosNaoOptante({ pctFederais: 3.65, aliquotaIss: 0.03 })).toEqual({
      percentual_total_tributos_federais: 3.65,
      percentual_total_tributos_estaduais: 0,
      percentual_total_tributos_municipais: 3,
    });
  });

  it("sem percentual federal cadastrado, federais saem 0 e municipais seguem o ISS", () => {
    expect(totaisAproximadosNaoOptante({ pctFederais: null, aliquotaIss: 0.03 })).toEqual({
      percentual_total_tributos_federais: 0,
      percentual_total_tributos_estaduais: 0,
      percentual_total_tributos_municipais: 3,
    });
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
