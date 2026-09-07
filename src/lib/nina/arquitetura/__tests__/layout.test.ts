import { describe, expect, it } from "bun:test";
import { NODES_ARQUITETURA, type NodeArquitetura } from "../manifesto";
import {
  ALTURA_NODE,
  LARGURA_NODE,
  calcularFitView,
  calcularLayout,
  calcularProfundidades,
  extrairArestas,
} from "../layout";

const sintetico: NodeArquitetura[] = [
  {
    id: "a",
    nome: "A",
    categoria: "ENTRADA",
    descricao: "",
    entrada: "-",
    saida: "-",
    anteriores: [],
    seguintes: ["b"],
    erros: [],
  },
  {
    id: "b",
    nome: "B",
    categoria: "IA",
    descricao: "",
    entrada: "-",
    saida: "-",
    anteriores: ["a"],
    seguintes: ["c"],
    erros: [],
  },
  {
    id: "c",
    nome: "C",
    categoria: "TOOLS",
    descricao: "",
    entrada: "-",
    saida: "-",
    anteriores: ["b"],
    seguintes: ["b"],
    erros: [],
  },
];

describe("layout da arquitetura", () => {
  it("coloca a entrada na primeira coluna e respeita a ordem", () => {
    const p = calcularProfundidades(sintetico);
    expect(p.get("a")).toBe(0);
    expect(p.get("b")).toBeGreaterThan(0);
    expect(p.get("c")).toBeGreaterThan(p.get("b") ?? 0);
  });

  it("termina mesmo com ciclo entre modelo e ferramenta", () => {
    const layout = calcularLayout(sintetico);
    expect(layout.nodes).toHaveLength(3);
    expect(layout.arestas.map((a) => a.id).sort()).toEqual(["a->b", "b->c", "c->b"]);
  });

  it("não duplica arestas declaradas nos dois sentidos", () => {
    const arestas = extrairArestas(NODES_ARQUITETURA);
    expect(new Set(arestas.map((a) => a.id)).size).toBe(arestas.length);
  });

  it("posiciona todos os nodes reais do manifesto sem sobreposição exata", () => {
    const layout = calcularLayout(NODES_ARQUITETURA);
    expect(layout.nodes).toHaveLength(NODES_ARQUITETURA.length);
    const chaves = layout.nodes.map((n) => `${n.x}:${n.y}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(layout.largura).toBeGreaterThan(LARGURA_NODE);
    expect(layout.altura).toBeGreaterThan(ALTURA_NODE);
  });

  it("usa a posição salva quando existir, sem alterar as conexões", () => {
    const layout = calcularLayout(NODES_ARQUITETURA, { "message.inbound": { x: 999, y: 777 } });
    const node = layout.nodes.find((n) => n.node.id === "message.inbound");
    expect(node?.x).toBe(999);
    expect(node?.y).toBe(777);
    expect(layout.arestas.length).toBe(extrairArestas(NODES_ARQUITETURA).length);
  });

  it("ajusta à tela dentro dos limites de escala", () => {
    const layout = calcularLayout(NODES_ARQUITETURA);
    const pequeno = calcularFitView(layout, { largura: 320, altura: 240 });
    expect(pequeno.escala).toBeGreaterThanOrEqual(0.2);
    expect(pequeno.escala).toBeLessThanOrEqual(1.5);
    const grande = calcularFitView(layout, { largura: 4000, altura: 3000 });
    expect(grande.escala).toBeLessThanOrEqual(1.5);
  });

  it("aguenta um volume maior de nodes", () => {
    const muitos: NodeArquitetura[] = Array.from({ length: 400 }, (_, i) => ({
      id: `n${i}`,
      nome: `N${i}`,
      categoria: "PROCESSAMENTO",
      descricao: "",
      entrada: "-",
      saida: "-",
      anteriores: i === 0 ? [] : [`n${i - 1}`],
      seguintes: i === 399 ? [] : [`n${i + 1}`],
      erros: [],
    }));
    const inicio = Date.now();
    const layout = calcularLayout(muitos);
    expect(layout.nodes).toHaveLength(400);
    expect(Date.now() - inicio).toBeLessThan(2000);
  });
});
