import { describe, expect, it } from "bun:test";
import { colunasRateio } from "./rateio-colunas";
import { agruparRateio, compararRateio, type RateioLinha } from "./rateio-receita";

const linha: RateioLinha = {
  id: "1",
  data: "2026-08-25",
  medico_id: "med-1",
  medico_nome: "DRA. ANA",
  especialidade_id: "esp-1",
  especialidade_nome: "CARDIOLOGIA",
  procedimento: "CONSULTA",
  grupo: "Cardiologia",
  receita: 100,
  repasse: 60,
  terceiro: 0,
  liquido: 40,
  margem: 40,
};

/**
 * O bug que este arquivo existe para não deixar voltar: a coluna do agrupador
 * apontava para um campo que a linha não tinha, e a tela mostrava "—" no lugar
 * da data (ou do nome) com os valores certos ao lado.
 */
const todasAsChavesExistem = (
  colunas: { chave: string }[],
  objeto: Record<string, unknown>,
): string[] => colunas.map((c) => c.chave).filter((chave) => !(chave in objeto));

describe("colunas do sintetico", () => {
  const agrupamentos = ["data", "profissional", "especialidade"] as const;

  for (const agruparPor of agrupamentos) {
    it(`agrupado por ${agruparPor}: toda coluna acha o campo na linha`, () => {
      const grupos = agruparRateio([linha], agruparPor);
      const colunas = colunasRateio("sintetico", agruparPor, false);
      expect(
        todasAsChavesExistem(colunas, grupos[0] as unknown as Record<string, unknown>),
      ).toEqual([]);
    });

    it(`agrupado por ${agruparPor}, comparando: toda coluna acha o campo`, () => {
      const comparados = compararRateio(
        agruparRateio([linha], agruparPor),
        agruparRateio([{ ...linha, id: "2", receita: 80, liquido: 30 }], agruparPor),
        agruparPor,
        0,
      );
      const colunas = colunasRateio("sintetico", agruparPor, true);
      expect(
        todasAsChavesExistem(colunas, comparados[0] as unknown as Record<string, unknown>),
      ).toEqual([]);
    });
  }

  it("a primeira coluna traz a data do grupo, e nao um campo vazio", () => {
    const [grupo] = agruparRateio([linha], "data");
    const [primeira] = colunasRateio("sintetico", "data", false);
    expect(primeira.formato).toBe("data");
    expect((grupo as unknown as Record<string, unknown>)[primeira.chave]).toBe("2026-08-25");
  });

  it("agrupado por profissional a primeira coluna traz o nome do medico", () => {
    const [grupo] = agruparRateio([linha], "profissional");
    const [primeira] = colunasRateio("sintetico", "profissional", false);
    expect(primeira.rotulo).toBe("Profissional");
    expect((grupo as unknown as Record<string, unknown>)[primeira.chave]).toBe("DRA. ANA");
  });
});

describe("colunas do analitico", () => {
  it("toda coluna acha o campo na linha do atendimento", () => {
    const colunas = colunasRateio("analitico", "data", false);
    expect(todasAsChavesExistem(colunas, linha as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("nao ganha as colunas de comparacao, que so existem no sintetico", () => {
    const chaves = colunasRateio("analitico", "data", true).map((c) => c.chave);
    expect(chaves).not.toContain("variacaoValor");
    expect(chaves).not.toContain("receitaAnterior");
  });
});
