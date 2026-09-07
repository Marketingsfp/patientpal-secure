import { describe, expect, it } from "bun:test";
import { NODES_ARQUITETURA } from "../manifesto";
import {
  SNAPSHOT_ANTERIOR,
  assinaturaAtual,
  calcularDiffArquitetura,
  diffEmTexto,
} from "../sync";

describe("architecture sync", () => {
  it("compara a foto anterior com o manifesto atual", () => {
    const diff = calcularDiffArquitetura();
    expect(diff.removidos).toEqual([]);
    expect(diff.adicionados.length).toBeGreaterThan(0);
    expect(diff.adicionados.length + diff.alterados.length + diff.inalterados.length).toBe(
      NODES_ARQUITETURA.length,
    );
  });

  it("não considera diferença quando nada muda", () => {
    const atual = assinaturaAtual();
    const diff = calcularDiffArquitetura(atual, atual);
    expect(diff.adicionados).toEqual([]);
    expect(diff.alterados).toEqual([]);
    expect(diff.removidos).toEqual([]);
    expect(diff.resumo).toBe("Arquitetura sincronizada — nenhuma alteração estrutural detectada.");
  });

  it("ignora troca apenas do caminho do arquivo", () => {
    const atual = assinaturaAtual();
    const anterior = atual.map((n) => ({ ...n, arquivo: `outro/${n.arquivo ?? "x"}` }));
    expect(calcularDiffArquitetura(anterior, atual).alterados).toEqual([]);
  });

  it("aponta node novo, alterado e removido", () => {
    const anterior = [
      {
        id: "a",
        categoria: "ENTRADA",
        arquivo: null,
        funcao: null,
        anteriores: [],
        seguintes: ["b"],
      },
      { id: "z", categoria: "SAIDA", arquivo: null, funcao: null, anteriores: [], seguintes: [] },
    ];
    const atual = [
      {
        id: "a",
        categoria: "ENTRADA",
        arquivo: null,
        funcao: null,
        anteriores: [],
        seguintes: ["c"],
      },
      { id: "c", categoria: "IA", arquivo: null, funcao: null, anteriores: ["a"], seguintes: [] },
    ];
    const diff = calcularDiffArquitetura(anterior, atual);
    expect(diff.adicionados).toEqual(["c"]);
    expect(diff.removidos).toEqual(["z"]);
    expect(diff.alterados.map((m) => m.id)).toEqual(["a"]);
    expect(diffEmTexto(diff)).toContain("+ c");
    expect(diffEmTexto(diff)).toContain("- z");
  });

  it("a foto anterior tem apenas nodes com identificador único", () => {
    const ids = SNAPSHOT_ANTERIOR.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
