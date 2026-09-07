/**
 * FASE 3 — Agrupamentos visuais por domínio funcional.
 * Testa apenas a moldura de leitura: nenhuma conexão ou node é alterado.
 */
import { describe, expect, test } from "bun:test";
import { NODES_ARQUITETURA } from "../manifesto";
import { calcularLayout, LARGURA_NODE, ALTURA_NODE } from "../layout";

describe("agrupamentos visuais da arquitetura", () => {
  const layout = calcularLayout(NODES_ARQUITETURA);

  test("gera grupos apenas para categorias reais do manifesto", () => {
    const categorias = new Set(NODES_ARQUITETURA.map((n) => n.categoria));
    expect(layout.grupos.length).toBeGreaterThan(0);
    for (const grupo of layout.grupos) {
      expect(categorias.has(grupo.categoria)).toBe(true);
      expect(grupo.nodes.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("cada grupo envolve os nodes que ele declara", () => {
    const mapa = new Map(layout.nodes.map((n) => [n.node.id, n]));
    for (const grupo of layout.grupos) {
      for (const id of grupo.nodes) {
        const item = mapa.get(id)!;
        expect(item.node.categoria).toBe(grupo.categoria);
        expect(item.x).toBeGreaterThanOrEqual(grupo.x);
        expect(item.y).toBeGreaterThanOrEqual(grupo.y);
        expect(item.x + LARGURA_NODE).toBeLessThanOrEqual(grupo.x + grupo.largura);
        expect(item.y + ALTURA_NODE).toBeLessThanOrEqual(grupo.y + grupo.altura);
      }
    }
  });

  test("um node pertence no máximo a um grupo", () => {
    const vistos = new Set<string>();
    for (const grupo of layout.grupos) {
      for (const id of grupo.nodes) {
        expect(vistos.has(id)).toBe(false);
        vistos.add(id);
      }
    }
  });

  test("o caminho principal é marcado e começa na entrada", () => {
    const principais = layout.nodes.filter((n) => n.principal);
    expect(principais.length).toBeGreaterThan(3);
    const primeiro = principais.sort((a, b) => a.coluna - b.coluna)[0]!;
    expect(primeiro.coluna).toBe(0);
  });

  test("agrupar não altera nodes nem conexões do manifesto", () => {
    expect(layout.nodes.length).toBe(NODES_ARQUITETURA.length);
    const arestasManifesto = new Set(
      NODES_ARQUITETURA.flatMap((n) => n.seguintes.map((s) => `${n.id}->${s}`)),
    );
    for (const id of arestasManifesto) {
      expect(layout.arestas.some((a) => a.id === id)).toBe(true);
    }
  });
});
