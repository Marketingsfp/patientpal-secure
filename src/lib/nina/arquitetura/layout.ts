/**
 * FASE 3 — Cálculo de posições visuais dos nodes da arquitetura da Nina.
 *
 * Camada pura: recebe o manifesto (FASE 1) e devolve coordenadas. Não importa
 * React, não acessa banco e não executa nada do fluxo da Nina. Mover um node
 * na tela altera apenas estes números, nunca a ordem real de execução.
 */
import type { CategoriaArquitetura, NodeArquitetura } from "./manifesto";

export type Posicao = { x: number; y: number };

export type NodePosicionado = {
  node: NodeArquitetura;
  x: number;
  y: number;
  coluna: number;
  linha: number;
};

export type ArestaArquitetura = {
  id: string;
  de: string;
  para: string;
};

export type LayoutArquitetura = {
  nodes: NodePosicionado[];
  arestas: ArestaArquitetura[];
  largura: number;
  altura: number;
};

export const LARGURA_NODE = 216;
export const ALTURA_NODE = 88;
const ESPACO_COLUNA = 300;
const ESPACO_LINHA = 116;
const MARGEM = 60;

/**
 * Profundidade = maior caminho a partir dos pontos de entrada. Ciclos
 * (ex.: modelo → tool → modelo) são tratados por limite de iterações, para
 * que o cálculo termine sempre.
 */
export function calcularProfundidades(nodes: NodeArquitetura[]): Map<string, number> {
  const existentes = new Set(nodes.map((n) => n.id));
  const profundidade = new Map<string, number>();
  for (const node of nodes) profundidade.set(node.id, 0);

  const limite = nodes.length + 1;
  for (let iteracao = 0; iteracao < limite; iteracao += 1) {
    let mudou = false;
    for (const node of nodes) {
      const anteriores = node.anteriores.filter((id) => existentes.has(id));
      if (anteriores.length === 0) continue;
      const candidato = Math.max(...anteriores.map((id) => profundidade.get(id) ?? 0)) + 1;
      if (candidato > (profundidade.get(node.id) ?? 0)) {
        profundidade.set(node.id, candidato);
        mudou = true;
      }
    }
    if (!mudou) break;
  }

  return profundidade;
}

/** Arestas únicas derivadas de `seguintes` (e de `anteriores`, por segurança). */
export function extrairArestas(nodes: NodeArquitetura[]): ArestaArquitetura[] {
  const existentes = new Set(nodes.map((n) => n.id));
  const vistas = new Set<string>();
  const arestas: ArestaArquitetura[] = [];

  const adicionar = (de: string, para: string) => {
    if (!existentes.has(de) || !existentes.has(para)) return;
    const id = `${de}->${para}`;
    if (vistas.has(id)) return;
    vistas.add(id);
    arestas.push({ id, de, para });
  };

  for (const node of nodes) {
    for (const seguinte of node.seguintes) adicionar(node.id, seguinte);
    for (const anterior of node.anteriores) adicionar(anterior, node.id);
  }

  return arestas;
}

/** Layout automático em camadas, da esquerda para a direita. */
export function calcularLayout(
  nodes: NodeArquitetura[],
  posicoesSalvas: Record<string, Posicao> = {},
): LayoutArquitetura {
  const profundidade = calcularProfundidades(nodes);
  const colunas = new Map<number, NodeArquitetura[]>();

  for (const node of nodes) {
    const coluna = profundidade.get(node.id) ?? 0;
    const lista = colunas.get(coluna) ?? [];
    lista.push(node);
    colunas.set(coluna, lista);
  }

  const posicionados: NodePosicionado[] = [];
  for (const [coluna, lista] of [...colunas.entries()].sort((a, b) => a[0] - b[0])) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    lista.forEach((node, linha) => {
      const salva = posicoesSalvas[node.id];
      posicionados.push({
        node,
        coluna,
        linha,
        x: salva ? salva.x : MARGEM + coluna * ESPACO_COLUNA,
        y: salva ? salva.y : MARGEM + linha * ESPACO_LINHA,
      });
    });
  }

  const largura = Math.max(
    ...posicionados.map((p) => p.x + LARGURA_NODE),
    LARGURA_NODE,
  ) + MARGEM;
  const altura = Math.max(...posicionados.map((p) => p.y + ALTURA_NODE), ALTURA_NODE) + MARGEM;

  return { nodes: posicionados, arestas: extrairArestas(nodes), largura, altura };
}

/** Escala e deslocamento para caber todo o desenho na área visível. */
export function calcularFitView(
  layout: LayoutArquitetura,
  viewport: { largura: number; altura: number },
  opcoes: { escalaMinima?: number; escalaMaxima?: number; margem?: number } = {},
): { escala: number; x: number; y: number } {
  const margem = opcoes.margem ?? 32;
  const escalaMinima = opcoes.escalaMinima ?? 0.2;
  const escalaMaxima = opcoes.escalaMaxima ?? 1.5;

  const largura = Math.max(layout.largura, 1);
  const altura = Math.max(layout.altura, 1);
  const dispX = Math.max(viewport.largura - margem * 2, 1);
  const dispY = Math.max(viewport.altura - margem * 2, 1);

  const bruta = Math.min(dispX / largura, dispY / altura);
  const escala = Math.min(escalaMaxima, Math.max(escalaMinima, bruta));

  return {
    escala,
    x: (viewport.largura - largura * escala) / 2,
    y: (viewport.altura - altura * escala) / 2,
  };
}

export const CORES_CATEGORIA: Record<CategoriaArquitetura, string> = {
  ENTRADA: "var(--chart-1)",
  PROCESSAMENTO: "var(--chart-2)",
  CONTEXTO: "var(--chart-3)",
  MEMORIA: "var(--chart-4)",
  INSTRUCOES: "var(--chart-5)",
  CONHECIMENTO: "var(--chart-3)",
  IA: "var(--primary)",
  TOOLS: "var(--chart-2)",
  VALIDACAO: "var(--chart-4)",
  SAIDA: "var(--chart-1)",
  OBSERVABILIDADE: "var(--muted-foreground)",
  ERRO_FALLBACK: "var(--destructive)",
};
