/**
 * Posições do canvas "Caminho da mensagem em produção". Camada pura: recebe
 * as etapas e ligações de `caminho-producao.ts` e devolve coordenadas e linhas.
 *
 * As faixas podem ser empilhadas (1 coluna) ou distribuídas em 2 colunas, para
 * aproveitar telas largas na tela cheia. Uma ligação entre faixas que ficam em
 * colunas diferentes vira um par de marcadores ("continua em…"/"vem de…").
 */
import {
  FAIXAS_CAMINHO,
  type EtapaCaminho,
  type FaixaCaminho,
  type LigacaoCaminho,
} from "./caminho-producao";

export const LARGURA_ETAPA = 250;
export const ALTURA_ETAPA = 76;
const PASSO_LINHA = 112;
const CABECALHO_FAIXA = 48;
const VAO_FAIXA = 32;
const VAO_COLUNA_FAIXAS = 72;
const MARGEM = 24;
const X_COLUNA: Record<EtapaCaminho["coluna"], number> = { [-1]: 0, 0: 330, 1: 660, 2: 980 };
const LARGURA_FAIXA = X_COLUNA[2] + LARGURA_ETAPA + 2 * MARGEM;

export type EtapaPosicionada = { etapa: EtapaCaminho; x: number; y: number };
export type LinhaPosicionada = {
  id: string;
  ligacao: LigacaoCaminho;
  d: string;
  rotulo?: { x: number; y: number; texto: string };
};
/** Ligação entre faixas em colunas diferentes: dois marcadores no lugar da linha. */
export type QuebraPosicionada = {
  id: string;
  ligacao: LigacaoCaminho;
  saida: { x: number; y: number; texto: string };
  chegada: { x: number; y: number; texto: string };
};
export type FaixaPosicionada = {
  id: FaixaCaminho;
  titulo: string;
  resumo: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
};
export type LayoutCaminho = {
  colunas: 1 | 2;
  etapas: EtapaPosicionada[];
  linhas: LinhaPosicionada[];
  quebras: QuebraPosicionada[];
  faixas: FaixaPosicionada[];
  largura: number;
  altura: number;
};

export function calcularLayoutCaminho(
  etapas: EtapaCaminho[],
  ligacoes: LigacaoCaminho[],
  colunas: 1 | 2 = 1,
): LayoutCaminho {
  // Em 2 colunas, metade das faixas (na ordem) fica em cada coluna, para a
  // leitura continuar de cima para baixo em cada uma.
  const porColuna = Math.ceil(FAIXAS_CAMINHO.length / colunas);
  const faixas: FaixaPosicionada[] = [];
  const posicionadas: EtapaPosicionada[] = [];
  const colunaDaFaixa = new Map<FaixaCaminho, number>();
  const topoColuna = Array.from({ length: colunas }, () => MARGEM);

  FAIXAS_CAMINHO.forEach((faixa, indice) => {
    const coluna = Math.min(colunas - 1, Math.floor(indice / porColuna));
    colunaDaFaixa.set(faixa.id, coluna);
    const daFaixa = etapas.filter((e) => e.faixa === faixa.id);
    const primeira = Math.min(...daFaixa.map((e) => e.linha));
    const ultima = Math.max(...daFaixa.map((e) => e.linha));
    const x0 = coluna * (LARGURA_FAIXA + VAO_COLUNA_FAIXAS);
    const y0 = topoColuna[coluna]!;
    for (const etapa of daFaixa) {
      posicionadas.push({
        etapa,
        x: x0 + MARGEM + X_COLUNA[etapa.coluna],
        y: y0 + CABECALHO_FAIXA + (etapa.linha - primeira) * PASSO_LINHA,
      });
    }
    const altura = CABECALHO_FAIXA + (ultima - primeira) * PASSO_LINHA + ALTURA_ETAPA + 12;
    faixas.push({ ...faixa, x: x0 + 8, y: y0, largura: LARGURA_FAIXA - 16, altura });
    topoColuna[coluna] = y0 + altura + VAO_FAIXA;
  });

  const porId = new Map(posicionadas.map((p) => [p.etapa.id, p]));
  const tituloFaixa = new Map(FAIXAS_CAMINHO.map((f) => [f.id, f.titulo]));
  const linhas: LinhaPosicionada[] = [];
  const quebras: QuebraPosicionada[] = [];

  for (const ligacao of ligacoes) {
    const a = porId.get(ligacao.de);
    const b = porId.get(ligacao.para);
    if (!a || !b) continue;
    const id = `${ligacao.de}->${ligacao.para}`;
    if (colunaDaFaixa.get(a.etapa.faixa) !== colunaDaFaixa.get(b.etapa.faixa)) {
      quebras.push({
        id,
        ligacao,
        saida: {
          x: a.x + LARGURA_ETAPA / 2,
          y: a.y + ALTURA_ETAPA,
          texto: `continua em ${tituloFaixa.get(b.etapa.faixa)}`,
        },
        chegada: {
          x: b.x + LARGURA_ETAPA / 2,
          y: b.y,
          texto: `vem de ${tituloFaixa.get(a.etapa.faixa)}`,
        },
      });
      continue;
    }
    let x1: number, y1: number, x2: number, y2: number;
    let d: string;
    if (a.etapa.coluna === b.etapa.coluna) {
      // Mesma coluna: desce do rodapé de uma para o topo da outra.
      x1 = x2 = a.x + LARGURA_ETAPA / 2;
      y1 = a.y + ALTURA_ETAPA;
      y2 = b.y;
      d = `M${x1},${y1} L${x2},${y2}`;
    } else {
      // Colunas diferentes: sai pela lateral voltada ao destino. Saída e
      // entrada na mesma lateral ficam deslocadas para não se sobreporem;
      // ida e volta entre as mesmas caixas também.
      const paraDireita = b.etapa.coluna > a.etapa.coluna;
      const volta = ligacao.tipo === "retorno" ? 14 : 0;
      x1 = paraDireita ? a.x + LARGURA_ETAPA : a.x;
      x2 = paraDireita ? b.x : b.x + LARGURA_ETAPA;
      y1 = a.y + ALTURA_ETAPA / 2 + 10 + volta;
      y2 = b.y + ALTURA_ETAPA / 2 - 10 + volta;
      const meio = (x1 + x2) / 2;
      d = `M${x1},${y1} C${meio},${y1} ${meio},${y2} ${x2},${y2}`;
    }
    linhas.push({
      id,
      ligacao,
      d,
      rotulo: ligacao.rotulo
        ? { x: (x1 + x2) / 2, y: (y1 + y2) / 2, texto: ligacao.rotulo }
        : undefined,
    });
  }

  return {
    colunas,
    etapas: posicionadas,
    linhas,
    quebras,
    faixas,
    largura: colunas * LARGURA_FAIXA + (colunas - 1) * VAO_COLUNA_FAIXAS,
    altura: Math.max(...topoColuna) - VAO_FAIXA + MARGEM,
  };
}

/** Escala que faz o desenho inteiro caber na área. */
export function escalaParaCaber(
  layout: Pick<LayoutCaminho, "largura" | "altura">,
  area: { largura: number; altura: number },
): number {
  return Math.min(area.largura / layout.largura, area.altura / layout.altura);
}

/** Escolhe 1 ou 2 colunas de faixas: a que deixa o desenho inteiro maior na área. */
export function melhorLayoutCaminho(
  etapas: EtapaCaminho[],
  ligacoes: LigacaoCaminho[],
  area: { largura: number; altura: number },
): LayoutCaminho {
  const empilhado = calcularLayoutCaminho(etapas, ligacoes, 1);
  const lado = calcularLayoutCaminho(etapas, ligacoes, 2);
  return escalaParaCaber(lado, area) > escalaParaCaber(empilhado, area) ? lado : empilhado;
}
