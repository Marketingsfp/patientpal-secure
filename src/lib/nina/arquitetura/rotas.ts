/**
 * FASE 4 — Roteamento visual das conexões e realce de caminho.
 *
 * Camada pura de desenho: recebe o layout já calculado (FASE 2/3) e devolve
 * o traçado de cada linha, além dos conjuntos de nodes/arestas a destacar.
 * Não altera manifesto, conexões, ordem de execução nem nada do backend.
 */
import {
  ALTURA_NODE,
  LARGURA_NODE,
  VAO_COLUNA,
  VAO_LINHA,
  type ArestaArquitetura,
  type LayoutArquitetura,
  type NodePosicionado,
} from "./layout";
import type { NodeArquitetura } from "./manifesto";

export type Ponto = { x: number; y: number };

export type RotaAresta = {
  id: string;
  de: string;
  para: string;
  /** Estratégia escolhida automaticamente para esta conexão. */
  estrategia: "direta" | "curva" | "ortogonal";
  pontos: Ponto[];
  /** Atributo `d` pronto para o <path> do SVG. */
  d: string;
  /** Conexão entre dois componentes do caminho principal. */
  principal: boolean;
  /** Vai da direita para a esquerda (retorno real do fluxo, ex.: tool → IA). */
  retorno: boolean;
  /** Ponto médio do traçado, usado para posicionar o rótulo/tooltip. */
  rotulo: Ponto;
};

const RAIO = 10;
/** Folga entre a borda do node e a primeira/última porta. */
const MARGEM_PORTA = 14;

function distribuirPortas(
  quantidade: number,
  indice: number,
  centro: number,
): number {
  if (quantidade <= 1) return centro;
  const util = Math.max(ALTURA_NODE - MARGEM_PORTA * 2, 8);
  const passo = util / (quantidade - 1);
  return centro - util / 2 + passo * indice;
}

/** Uma linha reta horizontal cruzaria algum node no caminho? */
function cruzaNode(
  a: Ponto,
  b: Ponto,
  nodes: NodePosicionado[],
  ignorar: Set<string>,
): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return nodes.some((n) => {
    if (ignorar.has(n.node.id)) return false;
    return (
      n.x < maxX &&
      n.x + LARGURA_NODE > minX &&
      n.y < maxY + 6 &&
      n.y + ALTURA_NODE > minY - 6
    );
  });
}

/** Corredores horizontais livres (faixas entre linhas de nodes). */
function corredoresDisponiveis(nodes: NodePosicionado[]): number[] {
  const faixas = new Set<number>();
  for (const n of nodes) {
    faixas.add(n.y - VAO_LINHA / 2);
    faixas.add(n.y + ALTURA_NODE + VAO_LINHA / 2);
  }
  return [...faixas].sort((x, y) => x - y);
}

function corredorLivre(
  candidatos: number[],
  alvo: number,
  x1: number,
  x2: number,
  nodes: NodePosicionado[],
  ignorar: Set<string>,
): number {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const ordenados = [...candidatos].sort(
    (a, b) => Math.abs(a - alvo) - Math.abs(b - alvo),
  );
  for (const y of ordenados) {
    const bloqueado = nodes.some((n) => {
      if (ignorar.has(n.node.id)) return false;
      return (
        n.x < maxX && n.x + LARGURA_NODE > minX && n.y - 4 < y && n.y + ALTURA_NODE + 4 > y
      );
    });
    if (!bloqueado) return y;
  }
  return alvo;
}

/** Polilinha ortogonal com cantos arredondados (estilo "smooth step"). */
export function pontosParaPath(pontos: Ponto[], raio = RAIO): string {
  if (pontos.length === 0) return "";
  if (pontos.length === 1) return `M ${pontos[0]!.x} ${pontos[0]!.y}`;
  let d = `M ${pontos[0]!.x} ${pontos[0]!.y}`;
  for (let i = 1; i < pontos.length - 1; i += 1) {
    const anterior = pontos[i - 1]!;
    const atual = pontos[i]!;
    const proximo = pontos[i + 1]!;
    const entrada = Math.min(
      raio,
      Math.hypot(atual.x - anterior.x, atual.y - anterior.y) / 2,
    );
    const saida = Math.min(
      raio,
      Math.hypot(proximo.x - atual.x, proximo.y - atual.y) / 2,
    );
    const ax = atual.x - Math.sign(atual.x - anterior.x) * entrada;
    const ay = atual.y - Math.sign(atual.y - anterior.y) * entrada;
    const bx = atual.x + Math.sign(proximo.x - atual.x) * saida;
    const by = atual.y + Math.sign(proximo.y - atual.y) * saida;
    d += ` L ${ax} ${ay} Q ${atual.x} ${atual.y}, ${bx} ${by}`;
  }
  const fim = pontos[pontos.length - 1]!;
  d += ` L ${fim.x} ${fim.y}`;
  return d;
}

function pontoMedio(pontos: Ponto[]): Ponto {
  if (pontos.length === 0) return { x: 0, y: 0 };
  const totais: number[] = [];
  let total = 0;
  for (let i = 1; i < pontos.length; i += 1) {
    const seg = Math.hypot(
      pontos[i]!.x - pontos[i - 1]!.x,
      pontos[i]!.y - pontos[i - 1]!.y,
    );
    total += seg;
    totais.push(total);
  }
  const meta = total / 2;
  for (let i = 0; i < totais.length; i += 1) {
    if (totais[i]! >= meta) {
      const inicioSeg = i === 0 ? 0 : totais[i - 1]!;
      const seg = totais[i]! - inicioSeg || 1;
      const t = (meta - inicioSeg) / seg;
      const a = pontos[i]!;
      const b = pontos[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return pontos[pontos.length - 1]!;
}

/**
 * Calcula o traçado de todas as conexões.
 *
 * Estratégia escolhida por conexão:
 *  - `direta`: nodes vizinhos praticamente na mesma linha;
 *  - `curva`: salto curto entre colunas adjacentes (bézier suave);
 *  - `ortogonal`: trechos longos ou de retorno, roteados por corredores
 *    livres para não atravessar nodes.
 */
export function calcularRotas(layout: LayoutArquitetura): RotaAresta[] {
  const mapa = new Map(layout.nodes.map((n) => [n.node.id, n]));
  const corredores = corredoresDisponiveis(layout.nodes);

  const saidas = new Map<string, ArestaArquitetura[]>();
  const entradas = new Map<string, ArestaArquitetura[]>();
  for (const aresta of layout.arestas) {
    if (!mapa.has(aresta.de) || !mapa.has(aresta.para)) continue;
    (saidas.get(aresta.de) ?? saidas.set(aresta.de, []).get(aresta.de)!).push(aresta);
    (entradas.get(aresta.para) ?? entradas.set(aresta.para, []).get(aresta.para)!).push(
      aresta,
    );
  }
  // Ordena as portas pela altura do outro extremo: evita linhas se cruzando
  // logo na saída/entrada do node.
  const alturaDe = (id: string) => (mapa.get(id)?.y ?? 0) + ALTURA_NODE / 2;
  for (const lista of saidas.values()) {
    lista.sort((a, b) => alturaDe(a.para) - alturaDe(b.para));
  }
  for (const lista of entradas.values()) {
    lista.sort((a, b) => alturaDe(a.de) - alturaDe(b.de));
  }

  const rotas: RotaAresta[] = [];
  for (const aresta of layout.arestas) {
    const de = mapa.get(aresta.de);
    const para = mapa.get(aresta.para);
    if (!de || !para) continue;

    const listaSaida = saidas.get(aresta.de) ?? [];
    const listaEntrada = entradas.get(aresta.para) ?? [];
    const y1 = distribuirPortas(
      listaSaida.length,
      listaSaida.findIndex((a) => a.id === aresta.id),
      de.y + ALTURA_NODE / 2,
    );
    const y2 = distribuirPortas(
      listaEntrada.length,
      listaEntrada.findIndex((a) => a.id === aresta.id),
      para.y + ALTURA_NODE / 2,
    );
    const x1 = de.x + LARGURA_NODE;
    const x2 = para.x;
    const retorno = x2 <= x1;
    const principal = Boolean(de.principal && para.principal);
    const ignorar = new Set([de.node.id, para.node.id]);

    let pontos: Ponto[];
    let estrategia: RotaAresta["estrategia"];

    if (
      !retorno &&
      Math.abs(y1 - y2) < 2 &&
      !cruzaNode({ x: x1, y: y1 }, { x: x2, y: y2 }, layout.nodes, ignorar)
    ) {
      estrategia = "direta";
      pontos = [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ];
    } else if (
      !retorno &&
      x2 - x1 <= VAO_COLUNA + 4 &&
      !cruzaNode({ x: x1, y: y1 }, { x: x2, y: y2 }, layout.nodes, ignorar)
    ) {
      estrategia = "curva";
      pontos = [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ];
    } else {
      estrategia = "ortogonal";
      const folga = Math.max(VAO_COLUNA / 2, 24);
      const xa = retorno ? x1 + folga : Math.min(x1 + folga, x2 - folga);
      const xb = retorno ? x2 - folga : Math.max(x2 - folga, xa);
      const alvo = (y1 + y2) / 2;
      const yc = corredorLivre(corredores, alvo, xa, xb, layout.nodes, ignorar);
      pontos = [
        { x: x1, y: y1 },
        { x: xa, y: y1 },
        { x: xa, y: yc },
        { x: xb, y: yc },
        { x: xb, y: y2 },
        { x: x2, y: y2 },
      ].filter(
        (ponto, indice, lista) =>
          indice === 0 ||
          Math.abs(ponto.x - lista[indice - 1]!.x) > 0.5 ||
          Math.abs(ponto.y - lista[indice - 1]!.y) > 0.5,
      );
    }

    const d =
      estrategia === "curva"
        ? (() => {
            const meio = (x1 + x2) / 2;
            return `M ${x1} ${y1} C ${meio} ${y1}, ${meio} ${y2}, ${x2} ${y2}`;
          })()
        : pontosParaPath(pontos);

    rotas.push({
      id: aresta.id,
      de: aresta.de,
      para: aresta.para,
      estrategia,
      pontos,
      d,
      principal,
      retorno,
      rotulo: pontoMedio(pontos),
    });
  }

  return rotas;
}

export type RealceArquitetura = {
  nodes: Set<string>;
  arestas: Set<string>;
};

function adjacencias(nodes: NodeArquitetura[]) {
  const existentes = new Set(nodes.map((n) => n.id));
  const depois = new Map<string, Set<string>>();
  const antes = new Map<string, Set<string>>();
  for (const node of nodes) {
    depois.set(node.id, new Set());
    antes.set(node.id, new Set());
  }
  const ligar = (de: string, para: string) => {
    if (!existentes.has(de) || !existentes.has(para)) return;
    depois.get(de)!.add(para);
    antes.get(para)!.add(de);
  };
  for (const node of nodes) {
    for (const seguinte of node.seguintes) ligar(node.id, seguinte);
    for (const anterior of node.anteriores) ligar(anterior, node.id);
  }
  return { depois, antes };
}

/** Node selecionado + vizinhos diretos (entradas e saídas). */
export function realceDireto(
  nodes: NodeArquitetura[],
  selecionado: string | null,
): RealceArquitetura {
  const vazio = { nodes: new Set<string>(), arestas: new Set<string>() };
  if (!selecionado) return vazio;
  const { depois, antes } = adjacencias(nodes);
  if (!depois.has(selecionado)) return vazio;

  const resultado: RealceArquitetura = {
    nodes: new Set([selecionado]),
    arestas: new Set<string>(),
  };
  for (const id of depois.get(selecionado)!) {
    resultado.nodes.add(id);
    resultado.arestas.add(`${selecionado}->${id}`);
  }
  for (const id of antes.get(selecionado)!) {
    resultado.nodes.add(id);
    resultado.arestas.add(`${id}->${selecionado}`);
  }
  return resultado;
}

/**
 * Caminho completo: tudo que leva até o node (montante) e tudo que decorre
 * dele (jusante). Percurso cycle-safe — ciclos reais do backend (IA → tool →
 * IA) não travam a busca.
 */
export function realceCaminhoCompleto(
  nodes: NodeArquitetura[],
  selecionado: string | null,
): RealceArquitetura {
  const vazio = { nodes: new Set<string>(), arestas: new Set<string>() };
  if (!selecionado) return vazio;
  const { depois, antes } = adjacencias(nodes);
  if (!depois.has(selecionado)) return vazio;

  const alcancados = new Set<string>([selecionado]);
  const arestas = new Set<string>();

  const percorrer = (mapa: Map<string, Set<string>>, paraFrente: boolean) => {
    const fila = [selecionado];
    const visitados = new Set<string>([selecionado]);
    while (fila.length > 0) {
      const atual = fila.shift()!;
      for (const vizinho of mapa.get(atual) ?? []) {
        arestas.add(paraFrente ? `${atual}->${vizinho}` : `${vizinho}->${atual}`);
        alcancados.add(vizinho);
        if (visitados.has(vizinho)) continue;
        visitados.add(vizinho);
        fila.push(vizinho);
      }
    }
  };

  percorrer(depois, true);
  percorrer(antes, false);

  return { nodes: alcancados, arestas };
}

/** Texto do tooltip da conexão: origem → destino, sem inventar condição. */
export function descreverConexao(
  nodes: NodeArquitetura[],
  de: string,
  para: string,
): string | null {
  const origem = nodes.find((n) => n.id === de);
  const destino = nodes.find((n) => n.id === para);
  if (!origem || !destino) return null;
  const saida = origem.saida ? ` (${origem.saida})` : "";
  return `${origem.nome} → ${destino.nome}${saida}`;
}
