import { describe, expect, test } from "bun:test";
import { classificarServicoNfse, codigoServicoDaNota } from "./nfse-classificacao-servico";

describe("classificarServicoNfse", () => {
  test.each([
    ["CONSULTA (PEDIATRIA)", "040101", "123012200"],
    ["ULTRASSONOGRAFIA ABDOMINAL TOTAL", "040205", "123019400"],
    ["USG TRANSVAGINAL", "040205", "123019400"],
    ["RX TORAX AP/PERFIL", "040205", "123019400"],
    ["ECOCARDIOGRAMA", "040205", "123019400"],
    ["MAMOGRAFIA DIGITAL", "040205", "123019400"],
    ["HEMOGRAMA COMPLETO", "040201", "123019300"],
    ["PREVENTIVO", "040201", "123019300"],
    ["ENDOSCOPIA DIGESTIVA", "040101", "123012200"],
    ["APLICAÇÃO DE VITAMINA B12", "040101", "123012200"],
    ["PRÓTESE TOTAL INCOLOR", "041401", "123012300"],
  ])("%s", (descricao, codigo, nbs) => {
    const c = classificarServicoNfse(descricao);
    expect(c?.codigo).toBe(codigo);
    expect(c?.nbs).toBe(nbs);
  });

  test("mistura de tipos ou texto desconhecido não decide", () => {
    expect(classificarServicoNfse("CONSULTA + ULTRASSONOGRAFIA")).toBeNull();
    expect(classificarServicoNfse("ODONTOLOGIA")).toBeNull();
    expect(classificarServicoNfse("")).toBeNull();
  });
});

describe("codigoServicoDaNota", () => {
  const base = { codigoEmitente: "040205", nbsEmitente: "1.2301.94.00" };

  test("código forçado vence a descrição", () => {
    expect(
      codigoServicoDaNota({ ...base, descricao: "CONSULTA", codigoForcado: "042201" }),
    ).toEqual({ codigo: "042201", nbs: null, codigoMunicipalValido: false });
  });

  test("descrição de outro tipo troca o código e invalida o municipal", () => {
    expect(codigoServicoDaNota({ ...base, descricao: "ENDOSCOPIA" })).toEqual({
      codigo: "040101",
      nbs: "123012200",
      codigoMunicipalValido: false,
    });
  });

  test("sem classificação fica o cadastro", () => {
    expect(codigoServicoDaNota({ ...base, descricao: "ODONTOLOGIA" })).toEqual({
      codigo: "040205",
      nbs: "123019400",
      codigoMunicipalValido: true,
    });
  });
});
