/**
 * FASE 7 — busca, filtro e minimapa do canvas (comportamento apenas visual).
 */
import { describe, expect, it } from "bun:test";
import {
  NODES_ARQUITETURA,
  CATEGORIAS_ARQUITETURA,
  type CategoriaArquitetura,
} from "../manifesto";
import {
  buscarNodes,
  calcularMinimapa,
  centralizarNoNode,
  nodesVisiveis,
  normalizarTermo,
} from "../navegacao";
import { ALTURA_NODE, LARGURA_NODE } from "../layout";

describe("busca de nodes", () => {
  it("não devolve nada com termo vazio", () => {
    expect(buscarNodes(NODES_ARQUITETURA, "")).toEqual([]);
    expect(buscarNodes(NODES_ARQUITETURA, "   ")).toEqual([]);
  });

  it("encontra por nome/descrição ignorando acento e caixa", () => {
    const resultado = buscarNodes(NODES_ARQUITETURA, "AGENDA");
    expect(resultado.length).toBeGreaterThan(0);
    expect(buscarNodes(NODES_ARQUITETURA, "agenda")).toEqual(resultado);
  });

  it("encontra pelo id exato do manifesto", () => {
    const alvo = NODES_ARQUITETURA[0]!;
    expect(buscarNodes(NODES_ARQUITETURA, alvo.id)).toContain(alvo.id);
  });

  it("devolve vazio para termo inexistente", () => {
    expect(buscarNodes(NODES_ARQUITETURA, "zzz-inexistente")).toEqual([]);
  });

  it("normaliza acentos", () => {
    expect(normalizarTermo(" Validação ")).toBe("validacao");
  });
});

describe("filtro por categoria", () => {
  it("mostra tudo quando não há filtro", () => {
    expect(nodesVisiveis(NODES_ARQUITETURA, null).size).toBe(NODES_ARQUITETURA.length);
    expect(nodesVisiveis(NODES_ARQUITETURA, new Set()).size).toBe(NODES_ARQUITETURA.length);
  });

  it("esconde apenas as categorias desmarcadas", () => {
    const categoria = NODES_ARQUITETURA[0]!.categoria;
    const restantes = new Set(
      CATEGORIAS_ARQUITETURA.filter((c: CategoriaArquitetura) => c !== categoria),
    );
    const visiveis = nodesVisiveis(NODES_ARQUITETURA, restantes);
    for (const node of NODES_ARQUITETURA) {
      expect(visiveis.has(node.id)).toBe(node.categoria !== categoria);
    }
  });

  it("não altera o manifesto", () => {
    const antes = JSON.stringify(NODES_ARQUITETURA);
    nodesVisiveis(NODES_ARQUITETURA, new Set([NODES_ARQUITETURA[0]!.categoria]));
    expect(JSON.stringify(NODES_ARQUITETURA)).toBe(antes);
  });
});

describe("minimapa e centralização", () => {
  it("cabe na caixa reservada", () => {
    const mini = calcularMinimapa({ largura: 3270, altura: 1020 }, { largura: 180, altura: 120 });
    expect(mini.largura).toBeLessThanOrEqual(180);
    expect(mini.altura).toBeLessThanOrEqual(120);
    expect(mini.escala).toBeGreaterThan(0);
  });

  it("centraliza o node na área visível", () => {
    const view = centralizarNoNode({ x: 500, y: 300 }, { largura: 800, altura: 600 }, 1);
    expect(view.x).toBe(400 - (500 + LARGURA_NODE / 2));
    expect(view.y).toBe(300 - (300 + ALTURA_NODE / 2));
  });
});
