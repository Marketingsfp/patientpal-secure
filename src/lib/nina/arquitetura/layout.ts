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
  /** Node pertence ao caminho principal (mensagem → IA → resposta). */
  principal?: boolean;
};

export type ArestaArquitetura = {
  id: string;
  de: string;
  para: string;
};

/** Moldura discreta que reúne nodes vizinhos do mesmo domínio funcional. */
export type GrupoVisual = {
  id: string;
  categoria: CategoriaArquitetura;
  x: number;
  y: number;
  largura: number;
  altura: number;
  nodes: string[];
};

export type LayoutArquitetura = {
  nodes: NodePosicionado[];
  arestas: ArestaArquitetura[];
  largura: number;
  altura: number;
  grupos: GrupoVisual[];
};

export const LARGURA_NODE = 216;
export const ALTURA_NODE = 88;
/** Vão entre níveis (~110px) e entre irmãos (~44px), somados ao tamanho do node. */
export const VAO_COLUNA = 110;
export const VAO_LINHA = 44;
const ESPACO_COLUNA = LARGURA_NODE + VAO_COLUNA;
const ESPACO_LINHA = ALTURA_NODE + VAO_LINHA;
const MARGEM = 60;

/**
 * Profundidade = distância mínima a partir dos pontos de entrada (BFS).
 * Usar a menor distância mantém o desenho compacto e termina sempre, mesmo
 * com ciclos reais do backend (ex.: modelo → ferramenta → modelo).
 */
export function calcularProfundidades(nodes: NodeArquitetura[]): Map<string, number> {
  const existentes = new Set(nodes.map((n) => n.id));
  const seguintes = new Map<string, string[]>();
  for (const node of nodes) {
    seguintes.set(
      node.id,
      node.seguintes.filter((id) => existentes.has(id)),
    );
  }
  for (const node of nodes) {
    for (const anterior of node.anteriores) {
      if (!existentes.has(anterior)) continue;
      const lista = seguintes.get(anterior) ?? [];
      if (!lista.includes(node.id)) lista.push(node.id);
      seguintes.set(anterior, lista);
    }
  }

  const profundidade = new Map<string, number>();
  const fila: string[] = [];
  for (const node of nodes) {
    const anteriores = node.anteriores.filter((id) => existentes.has(id));
    if (anteriores.length === 0) {
      profundidade.set(node.id, 0);
      fila.push(node.id);
    }
  }
  // Grafo só com ciclos: usa o primeiro node como raiz para não travar.
  if (fila.length === 0 && nodes.length > 0) {
    profundidade.set(nodes[0]!.id, 0);
    fila.push(nodes[0]!.id);
  }

  while (fila.length > 0) {
    const atual = fila.shift()!;
    const nivel = profundidade.get(atual) ?? 0;
    for (const proximo of seguintes.get(atual) ?? []) {
      if (profundidade.has(proximo)) continue;
      profundidade.set(proximo, nivel + 1);
      fila.push(proximo);
    }
  }

  // Nodes isolados (sem caminho a partir das entradas) ficam na última coluna.
  const maior = Math.max(0, ...profundidade.values());
  for (const node of nodes) {
    if (!profundidade.has(node.id)) profundidade.set(node.id, maior + 1);
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

/**
 * Caminho principal: maior cadeia a partir de uma entrada, seguindo sempre o
 * seguinte mais conectado. Serve para manter o fluxo feliz na linha central.
 */
function caminhoPrincipal(
  nodes: NodeArquitetura[],
  arestas: ArestaArquitetura[],
  profundidade: Map<string, number>,
): Set<string> {
  const grau = new Map<string, number>();
  const saidas = new Map<string, string[]>();
  for (const aresta of arestas) {
    grau.set(aresta.de, (grau.get(aresta.de) ?? 0) + 1);
    grau.set(aresta.para, (grau.get(aresta.para) ?? 0) + 1);
    const lista = saidas.get(aresta.de) ?? [];
    lista.push(aresta.para);
    saidas.set(aresta.de, lista);
  }

  const entrada =
    nodes.find((n) => (profundidade.get(n.id) ?? 0) === 0)?.id ?? nodes[0]?.id ?? null;
  const caminho = new Set<string>();
  let atual = entrada;
  while (atual && !caminho.has(atual)) {
    caminho.add(atual);
    const nivel = profundidade.get(atual) ?? 0;
    const candidatos = (saidas.get(atual) ?? []).filter(
      (id) => !caminho.has(id) && (profundidade.get(id) ?? 0) > nivel,
    );
    candidatos.sort((a, b) => (grau.get(b) ?? 0) - (grau.get(a) ?? 0));
    atual = candidatos[0] ?? null;
  }
  return caminho;
}

/** Layout automático em camadas, da esquerda para a direita. */
export function calcularLayout(
  nodes: NodeArquitetura[],
  posicoesSalvas: Record<string, Posicao> = {},
): LayoutArquitetura {
  const profundidade = calcularProfundidades(nodes);
  const arestas = extrairArestas(nodes);
  const principal = caminhoPrincipal(nodes, arestas, profundidade);

  const vizinhos = new Map<string, { antes: string[]; depois: string[] }>();
  for (const node of nodes) vizinhos.set(node.id, { antes: [], depois: [] });
  for (const aresta of arestas) {
    vizinhos.get(aresta.de)?.depois.push(aresta.para);
    vizinhos.get(aresta.para)?.antes.push(aresta.de);
  }

  const colunas = new Map<number, NodeArquitetura[]>();
  for (const node of nodes) {
    const coluna = profundidade.get(node.id) ?? 0;
    const lista = colunas.get(coluna) ?? [];
    lista.push(node);
    colunas.set(coluna, lista);
  }

  const chaves = [...colunas.keys()].sort((a, b) => a - b);
  const ordem = new Map<string, number>();
  for (const chave of chaves) {
    const lista = colunas.get(chave)!;
    // Ordem inicial estável: caminho principal primeiro, depois por nome.
    lista.sort((a, b) => {
      const pa = principal.has(a.id) ? 0 : 1;
      const pb = principal.has(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
    lista.forEach((node, indice) => ordem.set(node.id, indice));
  }

  // Sweeps de baricentro para reduzir cruzamentos entre colunas vizinhas.
  const baricentro = (id: string, lado: "antes" | "depois") => {
    const ligacoes = vizinhos.get(id)?.[lado] ?? [];
    const valores = ligacoes.map((outro) => ordem.get(outro)).filter((v): v is number => v != null);
    if (valores.length === 0) return ordem.get(id) ?? 0;
    return valores.reduce((soma, v) => soma + v, 0) / valores.length;
  };

  for (let passo = 0; passo < 4; passo += 1) {
    const sequencia = passo % 2 === 0 ? chaves : [...chaves].reverse();
    const lado = passo % 2 === 0 ? "antes" : "depois";
    for (const chave of sequencia) {
      const lista = colunas.get(chave)!;
      const pontuacao = new Map(lista.map((n) => [n.id, baricentro(n.id, lado)]));
      lista.sort((a, b) => {
        const diff = (pontuacao.get(a.id) ?? 0) - (pontuacao.get(b.id) ?? 0);
        if (Math.abs(diff) > 1e-9) return diff;
        return (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0);
      });
      lista.forEach((node, indice) => ordem.set(node.id, indice));
    }
  }

  // Mantém nodes do mesmo domínio funcional vizinhos dentro da coluna, sem
  // desfazer a ordem por baricentro (usa a média do grupo como critério).
  for (const chave of chaves) {
    const lista = colunas.get(chave)!;
    const grupos = new Map<CategoriaArquitetura, NodeArquitetura[]>();
    for (const node of lista) {
      const atual = grupos.get(node.categoria) ?? [];
      atual.push(node);
      grupos.set(node.categoria, atual);
    }
    const media = (itens: NodeArquitetura[]) =>
      itens.reduce((soma, n) => soma + (ordem.get(n.id) ?? 0), 0) / Math.max(itens.length, 1);
    const ordenados = [...grupos.values()]
      .sort((a, b) => media(a) - media(b))
      .flat();
    lista.splice(0, lista.length, ...ordenados);
    lista.forEach((node, indice) => ordem.set(node.id, indice));
  }

  // Linha de cada node dentro da coluna, deslocada para alinhar o caminho
  // principal em uma faixa central comum a todas as colunas.
  const linhas = new Map<string, number>();
  for (const chave of chaves) {
    const lista = colunas.get(chave)!;
    const indicePrincipal = lista.findIndex((n) => principal.has(n.id));
    const ancora = indicePrincipal >= 0 ? indicePrincipal : (lista.length - 1) / 2;
    lista.forEach((node, indice) => linhas.set(node.id, indice - ancora));
  }
  const menorLinha = Math.min(0, ...linhas.values());

  const posicionados: NodePosicionado[] = [];
  for (const chave of chaves) {
    for (const node of colunas.get(chave)!) {
      const salva = posicoesSalvas[node.id];
      const linha = (linhas.get(node.id) ?? 0) - menorLinha;
      posicionados.push({
        node,
        coluna: chave,
        linha: Math.round(linha),
        principal: principal.has(node.id),
        x: salva ? salva.x : MARGEM + chave * ESPACO_COLUNA,
        y: salva ? salva.y : MARGEM + linha * ESPACO_LINHA,
      });
    }
  }

  const largura = Math.max(
    ...posicionados.map((p) => p.x + LARGURA_NODE),
    LARGURA_NODE,
  ) + MARGEM;
  const altura = Math.max(...posicionados.map((p) => p.y + ALTURA_NODE), ALTURA_NODE) + MARGEM;

  return {
    nodes: posicionados,
    arestas,
    largura,
    altura,
    grupos: calcularGrupos(posicionados),
  };
}

/**
 * Agrupamentos visuais discretos: reúne nodes da mesma categoria que já
 * ficaram próximos no desenho. É apenas moldura de leitura — não altera
 * conexões, ordem de execução nem nada do backend.
 */
export function calcularGrupos(posicionados: NodePosicionado[]): GrupoVisual[] {
  const PADDING = 16;
  const grupos: GrupoVisual[] = [];

  const porCategoria = new Map<CategoriaArquitetura, NodePosicionado[]>();
  for (const item of posicionados) {
    const lista = porCategoria.get(item.node.categoria) ?? [];
    lista.push(item);
    porCategoria.set(item.node.categoria, lista);
  }

  for (const [categoria, itens] of porCategoria) {
    // Clusteriza por proximidade (mesma coluna ou coluna vizinha e linhas próximas).
    const restantes = [...itens];
    while (restantes.length > 0) {
      const cluster = [restantes.shift()!];
      let cresceu = true;
      while (cresceu) {
        cresceu = false;
        for (let i = restantes.length - 1; i >= 0; i -= 1) {
          const candidato = restantes[i]!;
          const perto = cluster.some(
            (membro) =>
              Math.abs(membro.x - candidato.x) <= ESPACO_COLUNA + 1 &&
              Math.abs(membro.y - candidato.y) <= ESPACO_LINHA * 1.5,
          );
          if (perto) {
            cluster.push(candidato);
            restantes.splice(i, 1);
            cresceu = true;
          }
        }
      }
      if (cluster.length < 2) continue;
      const x = Math.min(...cluster.map((c) => c.x)) - PADDING;
      const y = Math.min(...cluster.map((c) => c.y)) - PADDING - 18;
      const x2 = Math.max(...cluster.map((c) => c.x + LARGURA_NODE)) + PADDING;
      const y2 = Math.max(...cluster.map((c) => c.y + ALTURA_NODE)) + PADDING;
      grupos.push({
        id: `${categoria}-${cluster.map((c) => c.node.id).sort()[0]}`,
        categoria,
        x,
        y,
        largura: x2 - x,
        altura: y2 - y,
        nodes: cluster.map((c) => c.node.id),
      });
    }
  }

  return grupos.sort((a, b) => b.largura * b.altura - a.largura * a.altura);
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
