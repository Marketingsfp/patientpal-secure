import { describe, expect, it } from "bun:test";
import {
  largurasDasColunas,
  montarMatrizRelatorio,
  nomeDeAbaValido,
  type PlanilhaRelatorio,
} from "./exportar-xlsx";

const planilha: PlanilhaRelatorio = {
  arquivo: "rateio",
  cabecalho: ["Rateio da Receita", "01/08/2026 a 26/08/2026"],
  colunas: [
    { rotulo: "Data", tipo: "texto" },
    { rotulo: "Receita bruta", tipo: "moeda" },
  ],
  linhas: [
    ["03/08/2026", 1500.5],
    ["04/08/2026", 900],
  ],
  totais: ["TOTAL GERAL", 2400.5],
};

describe("montarMatrizRelatorio", () => {
  it("poe o contexto no topo, separa com uma linha vazia e depois a tabela", () => {
    const { matriz, linhaCabecalho } = montarMatrizRelatorio(planilha);
    expect(matriz[0]).toEqual(["Rateio da Receita"]);
    expect(matriz[1]).toEqual(["01/08/2026 a 26/08/2026"]);
    expect(matriz[2]).toEqual([]);
    expect(linhaCabecalho).toBe(3);
    expect(matriz[linhaCabecalho]).toEqual(["Data", "Receita bruta"]);
  });

  it("mantem os valores numericos como numero, para o Excel somar a coluna", () => {
    const { matriz } = montarMatrizRelatorio(planilha);
    expect(matriz[4][1]).toBe(1500.5);
    expect(typeof matriz[4][1]).toBe("number");
  });

  it("fecha com a linha de totais", () => {
    const { matriz } = montarMatrizRelatorio(planilha);
    expect(matriz[matriz.length - 1]).toEqual(["TOTAL GERAL", 2400.5]);
  });

  it("sem contexto, a tabela comeca na primeira linha", () => {
    const { matriz, linhaCabecalho } = montarMatrizRelatorio({ ...planilha, cabecalho: [] });
    expect(linhaCabecalho).toBe(0);
    expect(matriz[0]).toEqual(["Data", "Receita bruta"]);
  });
});

describe("largurasDasColunas", () => {
  it("respeita o piso, o teto e a largura pedida", () => {
    const larguras = largurasDasColunas({
      ...planilha,
      colunas: [{ rotulo: "Data" }, { rotulo: "Serviço" }, { rotulo: "Fixa", largura: 30 }],
      linhas: [["03/08/2026", "X".repeat(80), "y"]],
    });
    expect(larguras[0]).toBe(12);
    expect(larguras[1]).toBe(46);
    expect(larguras[2]).toBe(30);
  });
});

describe("nomeDeAbaValido", () => {
  it("troca os caracteres que o Excel recusa e corta em 31", () => {
    expect(nomeDeAbaValido("Rateio/2026")).toBe("Rateio-2026");
    expect(nomeDeAbaValido("A".repeat(40))).toHaveLength(31);
  });

  it("cai num nome padrao quando vem vazio", () => {
    expect(nomeDeAbaValido("   ")).toBe("Relatório");
  });
});
