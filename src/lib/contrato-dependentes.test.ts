import { describe, expect, it } from "bun:test";
import { descreverVinculosAtivos, type VinculoAtivoDoPaciente } from "./contrato-dependentes";

const comoDependente: VinculoAtivoDoPaciente = {
  contratoId: "c1",
  numero: 20260754,
  titularNome: "Jose Umberto Gomes",
  convenioNome: "CARTÃO CONSULTA",
  vinculo: "dependente",
};

const comoTitular: VinculoAtivoDoPaciente = {
  contratoId: "c2",
  numero: 20262652,
  titularNome: "Nicolas da Silva Gomes",
  convenioNome: "CARTÃO CONSULTA + SEGUROS",
  vinculo: "titular",
};

describe("descreverVinculosAtivos", () => {
  it("mostra número do cartão, convênio e o titular atual", () => {
    const texto = descreverVinculosAtivos("NICOLAS DA SILVA GOMES", [comoDependente]);
    expect(texto).toContain("cartão 20260754");
    expect(texto).toContain("CARTÃO CONSULTA");
    expect(texto).toContain("JOSE UMBERTO GOMES");
    expect(texto).toContain("já está em outro cartão ativo");
  });

  it("diz quando o paciente é o titular do outro cartão", () => {
    const texto = descreverVinculosAtivos("NICOLAS", [comoTitular]);
    expect(texto).toContain("onde é o TITULAR");
    expect(texto).not.toContain("dependente de");
  });

  it("conta certo quando são vários cartões", () => {
    const texto = descreverVinculosAtivos("NICOLAS", [comoDependente, comoTitular]);
    expect(texto).toContain("já está em 2 outros cartões ativos");
    expect(texto).toContain("cartão 20260754");
    expect(texto).toContain("cartão 20262652");
  });

  it("não quebra quando o contrato está sem número ou sem convênio", () => {
    const texto = descreverVinculosAtivos("PACIENTE", [
      {
        contratoId: "c3",
        numero: null,
        titularNome: "MARIA",
        convenioNome: null,
        vinculo: "dependente",
      },
    ]);
    expect(texto).toContain("um cartão");
    expect(texto).toContain("MARIA");
    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("null");
  });
});
