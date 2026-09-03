import { describe, expect, it } from "bun:test";
import {
  chaveCategoria,
  descricaoSelecao,
  filtrarPorCategoria,
  opcoesDeCategoria,
  rotuloSelecao,
  SEM_CATEGORIA,
} from "./filtro-categoria";

const linha = (categoria: string) => ({ categoria });
const cat = (l: { categoria: string }) => l.categoria;

describe("chaveCategoria", () => {
  it("compara em caixa alta e sem espaços nas pontas", () => {
    expect(chaveCategoria(" Boletos ")).toBe("BOLETOS");
    expect(chaveCategoria(null)).toBe("");
  });
});

describe("filtrarPorCategoria", () => {
  const linhas = [linha("PARTICULAR"), linha("REPASSE MEDICO"), linha("BOLETOS")];

  it("selecao vazia e todas as categorias, nao nenhuma", () => {
    expect(filtrarPorCategoria(linhas, [], cat)).toHaveLength(3);
  });

  it("uma categoria deixa so as linhas dela", () => {
    expect(filtrarPorCategoria(linhas, ["PARTICULAR"], cat)).toEqual([linha("PARTICULAR")]);
  });

  it("mais de uma categoria soma as duas", () => {
    expect(filtrarPorCategoria(linhas, ["PARTICULAR", "BOLETOS"], cat).map(cat)).toEqual([
      "PARTICULAR",
      "BOLETOS",
    ]);
  });

  it("o cadastro escrito em caixa baixa continua casando", () => {
    expect(filtrarPorCategoria([linha("Boletos")], ["BOLETOS"], cat)).toHaveLength(1);
    expect(filtrarPorCategoria([linha("BOLETOS")], ["boletos"], cat)).toHaveLength(1);
  });

  it("categoria escolhida sem nenhuma linha devolve lista vazia", () => {
    expect(filtrarPorCategoria(linhas, ["ALUGUEL"], cat)).toEqual([]);
  });
});

describe("opcoesDeCategoria", () => {
  it("junta o cadastro com o que apareceu no periodo, sem repetir", () => {
    expect(
      opcoesDeCategoria(["Boletos", "ALUGUEL"], ["BOLETOS", "TRANSFERENCIA ENTRE CAIXAS"]),
    ).toEqual(["ALUGUEL", "BOLETOS", "TRANSFERENCIA ENTRE CAIXAS"]);
  });

  it("sem categoria desce para o fim mesmo em ordem alfabetica", () => {
    const opcoes = opcoesDeCategoria([SEM_CATEGORIA, "ALUGUEL"], ["ZELADORIA"]);
    expect(opcoes[opcoes.length - 1]).toBe(SEM_CATEGORIA);
  });

  it("nome vazio nao vira opcao", () => {
    expect(opcoesDeCategoria(["", "  "], [])).toEqual([]);
  });
});

describe("rotuloSelecao", () => {
  it("nada escolhido abre em todas", () => {
    expect(rotuloSelecao([])).toBe("TODAS AS CATEGORIAS");
  });

  it("uma escolhida mostra o nome inteiro", () => {
    expect(rotuloSelecao(["PARTICULAR"])).toBe("PARTICULAR");
  });

  it("a partir de duas vira contagem", () => {
    expect(rotuloSelecao(["PARTICULAR", "BOLETOS"])).toBe("2 categorias");
  });
});

describe("descricaoSelecao", () => {
  it("nao gasta linha do cabecalho quando nada foi filtrado", () => {
    expect(descricaoSelecao([])).toBe("");
  });

  it("escreve o nome de cada categoria escolhida", () => {
    expect(descricaoSelecao(["PARTICULAR", "boletos"])).toBe("Categoria: PARTICULAR, BOLETOS");
  });
});
