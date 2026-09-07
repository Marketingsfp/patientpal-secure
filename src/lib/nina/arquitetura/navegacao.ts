/**
 * FASE 7 — Apoio de navegação do canvas da Arquitetura.
 *
 * Tudo aqui é puramente visual: busca, filtro por categoria e cálculo do
 * minimapa. Nada nesta camada altera o Architecture Manifest, o backend da
 * Nina, conexões ou ordem de execução. Filtrar apenas esconde na tela.
 */
import type { CategoriaArquitetura, NodeArquitetura } from "./manifesto";
import { ALTURA_NODE, LARGURA_NODE, type LayoutArquitetura } from "./layout";

/** Normaliza para busca tolerante a acento e caixa. */
export function normalizarTermo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Nodes que combinam com o termo digitado (nome, id, categoria, descrição,
 * arquivo ou função). Termo vazio devolve conjunto vazio: sem busca ativa.
 */
export function buscarNodes(nodes: NodeArquitetura[], termo: string): string[] {
  const alvo = normalizarTermo(termo);
  if (!alvo) return [];
  return nodes
    .filter((node) => {
      const campos = [
        node.nome,
        node.id,
        node.categoria,
        node.descricao,
        node.arquivo ?? "",
        node.funcao ?? "",
      ];
      return campos.some((campo) => normalizarTermo(String(campo)).includes(alvo));
    })
    .map((node) => node.id);
}

/**
 * Ids visíveis conforme as categorias marcadas. Conjunto vazio de categorias
 * significa "mostrar tudo" — nunca esconder o grafo inteiro por engano.
 */
export function nodesVisiveis(
  nodes: NodeArquitetura[],
  categorias: ReadonlySet<CategoriaArquitetura> | null,
): Set<string> {
  if (!categorias || categorias.size === 0) return new Set(nodes.map((n) => n.id));
  return new Set(nodes.filter((n) => categorias.has(n.categoria)).map((n) => n.id));
}

export type CaixaMinimapa = {
  escala: number;
  largura: number;
  altura: number;
};

/** Escala do minimapa para caber na caixa reservada, sem distorcer. */
export function calcularMinimapa(
  layout: Pick<LayoutArquitetura, "largura" | "altura">,
  caixa: { largura: number; altura: number },
): CaixaMinimapa {
  const largura = Math.max(1, layout.largura);
  const altura = Math.max(1, layout.altura);
  const escala = Math.min(caixa.largura / largura, caixa.altura / altura);
  return {
    escala,
    largura: Math.round(largura * escala),
    altura: Math.round(altura * escala),
  };
}

/**
 * Posição de view que deixa um node no centro da área visível, mantendo o
 * zoom atual.
 */
export function centralizarNoNode(
  posicao: { x: number; y: number },
  area: { largura: number; altura: number },
  escala: number,
): { x: number; y: number } {
  return {
    x: area.largura / 2 - (posicao.x + LARGURA_NODE / 2) * escala,
    y: area.altura / 2 - (posicao.y + ALTURA_NODE / 2) * escala,
  };
}
