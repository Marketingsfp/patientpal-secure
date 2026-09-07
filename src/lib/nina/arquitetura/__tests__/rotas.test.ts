import { describe, expect, it } from "bun:test";
import { NODES_ARQUITETURA } from "../manifesto";
import { ALTURA_NODE, LARGURA_NODE, calcularLayout } from "../layout";
import {
  calcularRotas,
  descreverConexao,
  pontosParaPath,
  realceCaminhoCompleto,
  realceDireto,
} from "../rotas";

const layout = calcularLayout(NODES_ARQUITETURA);
const rotas = calcularRotas(layout);

describe("roteamento das conexões (FASE 4)", () => {
  it("gera uma rota para cada conexão do layout", () => {
    expect(rotas).toHaveLength(layout.arestas.length);
    for (const rota of rotas) {
      expect(rota.d.startsWith("M ")).toBe(true);
      expect(rota.pontos.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("não inventa nem remove conexões do manifesto", () => {
    const doLayout = new Set(layout.arestas.map((a) => a.id));
    const dasRotas = new Set(rotas.map((r) => r.id));
    expect([...dasRotas].every((id) => doLayout.has(id))).toBe(true);
    expect(dasRotas.size).toBe(doLayout.size);
  });

  it("sai pela direita da origem e entra pela esquerda do destino", () => {
    const mapa = new Map(layout.nodes.map((n) => [n.node.id, n]));
    for (const rota of rotas) {
      const de = mapa.get(rota.de)!;
      const para = mapa.get(rota.para)!;
      const inicio = rota.pontos[0]!;
      const fim = rota.pontos[rota.pontos.length - 1]!;
      expect(inicio.x).toBeCloseTo(de.x + LARGURA_NODE, 5);
      expect(fim.x).toBeCloseTo(para.x, 5);
      expect(inicio.y).toBeGreaterThanOrEqual(de.y);
      expect(inicio.y).toBeLessThanOrEqual(de.y + ALTURA_NODE);
      expect(fim.y).toBeGreaterThanOrEqual(para.y);
      expect(fim.y).toBeLessThanOrEqual(para.y + ALTURA_NODE);
    }
  });

  it("distribui as portas quando o node tem várias conexões", () => {
    const porOrigem = new Map<string, number[]>();
    for (const rota of rotas) {
      const lista = porOrigem.get(rota.de) ?? [];
      lista.push(rota.pontos[0]!.y);
      porOrigem.set(rota.de, lista);
    }
    const comMuitas = [...porOrigem.entries()].filter(([, ys]) => ys.length >= 3);
    expect(comMuitas.length).toBeGreaterThan(0);
    for (const [, ys] of comMuitas) {
      expect(new Set(ys.map((y) => Math.round(y))).size).toBe(ys.length);
    }
  });

  it("usa rota ortogonal para trechos longos e de retorno", () => {
    const retornos = rotas.filter((r) => r.retorno);
    expect(retornos.length).toBeGreaterThan(0);
    for (const rota of retornos) expect(rota.estrategia).toBe("ortogonal");
  });

  it("rotas ortogonais só têm segmentos horizontais ou verticais", () => {
    for (const rota of rotas.filter((r) => r.estrategia === "ortogonal")) {
      for (let i = 1; i < rota.pontos.length; i += 1) {
        const a = rota.pontos[i - 1]!;
        const b = rota.pontos[i]!;
        const reto = Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
        expect(reto).toBe(true);
      }
    }
  });

  it("rotas ortogonais evitam atravessar o corpo dos nodes", () => {
    const mapa = new Map(layout.nodes.map((n) => [n.node.id, n]));
    let atravessa = 0;
    for (const rota of rotas.filter((r) => r.estrategia === "ortogonal")) {
      for (let i = 1; i < rota.pontos.length; i += 1) {
        const a = rota.pontos[i - 1]!;
        const b = rota.pontos[i]!;
        if (Math.abs(a.y - b.y) > 0.5) continue; // só o trecho longo horizontal
        const minX = Math.min(a.x, b.x) + 2;
        const maxX = Math.max(a.x, b.x) - 2;
        for (const n of layout.nodes) {
          if (n.node.id === rota.de || n.node.id === rota.para) continue;
          if (
            n.x < maxX &&
            n.x + LARGURA_NODE > minX &&
            n.y < a.y &&
            n.y + ALTURA_NODE > a.y
          ) {
            atravessa += 1;
          }
        }
      }
    }
    expect(atravessa).toBe(0);
  });

  it("pontosParaPath produz um traçado com cantos arredondados", () => {
    const d = pontosParaPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(d).toContain("M 0 0");
    expect(d).toContain("Q 100 0");
  });
});

describe("realce de caminho (FASE 4)", () => {
  const alvo = "ai.model_call";

  it("realce direto traz apenas o node e seus vizinhos imediatos", () => {
    const realce = realceDireto(NODES_ARQUITETURA, alvo);
    const node = NODES_ARQUITETURA.find((n) => n.id === alvo)!;
    expect(realce.nodes.has(alvo)).toBe(true);
    for (const seguinte of node.seguintes) {
      expect(realce.nodes.has(seguinte)).toBe(true);
      expect(realce.arestas.has(`${alvo}->${seguinte}`)).toBe(true);
    }
    expect(realce.nodes.size).toBeLessThan(NODES_ARQUITETURA.length);
  });

  it("caminho completo inclui montante e jusante sem travar em ciclos", () => {
    const completo = realceCaminhoCompleto(NODES_ARQUITETURA, alvo);
    const direto = realceDireto(NODES_ARQUITETURA, alvo);
    expect(completo.nodes.size).toBeGreaterThan(direto.nodes.size);
    expect(completo.nodes.has("message.inbound")).toBe(true);
  });

  it("sem seleção não destaca nada", () => {
    expect(realceDireto(NODES_ARQUITETURA, null).nodes.size).toBe(0);
    expect(realceCaminhoCompleto(NODES_ARQUITETURA, null).nodes.size).toBe(0);
    expect(realceCaminhoCompleto(NODES_ARQUITETURA, "inexistente").nodes.size).toBe(0);
  });

  it("tooltip descreve origem → destino sem inventar condição", () => {
    const aresta = layout.arestas[0]!;
    const texto = descreverConexao(NODES_ARQUITETURA, aresta.de, aresta.para)!;
    const origem = NODES_ARQUITETURA.find((n) => n.id === aresta.de)!;
    const destino = NODES_ARQUITETURA.find((n) => n.id === aresta.para)!;
    expect(texto).toContain(origem.nome);
    expect(texto).toContain(destino.nome);
    expect(texto).toContain(origem.saida);
    expect(descreverConexao(NODES_ARQUITETURA, "x", "y")).toBeNull();
  });
});
