import { describe, expect, it } from "bun:test";
import { normalizarNomeBusca, normalizarTermoBusca } from "./busca-texto";

describe("normalizarTermoBusca", () => {
  it("tira o espaço sobrando das pontas", () => {
    expect(normalizarTermoBusca("  MARIA DA SILVA  ")).toBe("MARIA DA SILVA");
  });

  it("junta espaços repetidos no meio — o caso que a recepção relatou", () => {
    expect(normalizarTermoBusca("MARIA   DA  SILVA")).toBe("MARIA DA SILVA");
  });

  it('troca o espaço "duro" de PDF e página web por espaço comum', () => {
    expect(normalizarTermoBusca("MARIA DA SILVA")).toBe("MARIA DA SILVA");
  });

  it("aceita nome colado de planilha, com tabulação e quebra de linha", () => {
    expect(normalizarTermoBusca("MARIA\tDA\nSILVA\r\n")).toBe("MARIA DA SILVA");
  });

  it("descarta caracteres invisíveis do Word e o BOM de arquivo", () => {
    expect(normalizarTermoBusca("﻿MARIA​DA SILVA")).toBe("MARIADA SILVA");
  });

  it("não quebra com texto vazio nem com nulo", () => {
    expect(normalizarTermoBusca("")).toBe("");
    expect(normalizarTermoBusca(null)).toBe("");
    expect(normalizarTermoBusca(undefined)).toBe("");
  });
});

describe("normalizarNomeBusca", () => {
  it("deixa o nome no formato gravado no banco: sem acento e em maiúsculas", () => {
    expect(normalizarNomeBusca(" joão  gonçalves ")).toBe("JOAO GONCALVES");
  });
});
