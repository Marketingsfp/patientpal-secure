import { describe, expect, test } from "bun:test";
import { diaPesquisaCatalogo } from "../catalogo-pesquisa";

describe("dia da semana na pesquisa do catálogo", () => {
  test("recupera o sábado da mensagem quando o modelo omite o filtro", () => {
    expect(diaPesquisaCatalogo(undefined, "Quais os nomes delas? Alguma atende sábado?")).toBe(
      "sábado",
    );
  });

  test("preserva o filtro informado pelo modelo", () => {
    expect(diaPesquisaCatalogo("quinta-feira", "Alguma atende sábado?")).toBe("quinta-feira");
  });

  test("não cria filtro quando nenhum dia foi pedido", () => {
    expect(diaPesquisaCatalogo(undefined, "Quais são os nomes das médicas?")).toBeNull();
  });
});
