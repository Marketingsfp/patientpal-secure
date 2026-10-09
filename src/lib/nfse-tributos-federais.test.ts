import { describe, expect, test } from "bun:test";
import { ibsCbsDaNota, pisCofinsDaNota } from "./nfse-tributos-federais";

const ma = {
  optante_simples: false,
  pis_cofins_cst: "01",
  aliquota_pis: "0.65",
  aliquota_cofins: "3",
  ibs_cbs_cst: "200",
  ibs_cbs_classificacao: "200029",
  ibs_cbs_indicador_operacao: "030101",
};

describe("pisCofinsDaNota", () => {
  test("lucro presumido manda CST 01 com alíquotas e valores", () => {
    expect(pisCofinsDaNota(ma, 120)).toEqual({
      situacao_tributaria_pis_cofins: "01",
      base_calculo_pis_cofins: 120,
      aliquota_pis: 0.65,
      aliquota_cofins: 3,
      valor_pis: 0.78,
      valor_cofins: 3.6,
      tipo_retencao_pis_cofins: 0,
    });
  });

  test("Simples ou cadastro vazio continua CST 08", () => {
    expect(pisCofinsDaNota({ ...ma, optante_simples: true }, 100)).toEqual({
      situacao_tributaria_pis_cofins: "08",
    });
    expect(pisCofinsDaNota({ optante_simples: false }, 100)).toEqual({
      situacao_tributaria_pis_cofins: "08",
    });
  });
});

describe("ibsCbsDaNota", () => {
  test("com cadastro manda o bloco, consumidor final para CPF", () => {
    expect(ibsCbsDaNota(ma, "12345678901")).toEqual({
      finalidade_emissao: 0,
      consumidor_final: 1,
      codigo_indicador_operacao: "030101",
      indicador_destinatario: 0,
      ibs_cbs_situacao_tributaria: "200",
      ibs_cbs_classificacao_tributaria: "200029",
    });
    expect(ibsCbsDaNota(ma, "12345678000199")).toMatchObject({ consumidor_final: 0 });
  });

  test("sem cadastro não manda nada", () => {
    expect(ibsCbsDaNota({}, "12345678901")).toEqual({});
  });
});
