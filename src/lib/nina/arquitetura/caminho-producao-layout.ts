/**
 * Posições do canvas "Caminho da mensagem em produção". Camada pura: recebe
 * as etapas e ligações de `caminho-producao.ts` e devolve coordenadas e linhas.
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
const MARGEM = 24;
const X_COLUNA: Record<EtapaCaminho["coluna"], number> = { [-1]: 0, 0: 330, 1: 660, 2: 980 };

export type EtapaPosicionada = { etapa: EtapaCaminho; x: number; y: number };
export type LinhaPosicionada = {
  id: string;
  ligacao: LigacaoCaminho;
  d: string;
  rotulo?: { x: number; y: number; texto: string };
};
export type FaixaPosicionada = { id: FaixaCaminho; titulo: string; resumo: string; y: number; altura: number };
export type LayoutCaminho = {
  etapas: EtapaPosicionada[];
  linhas: LinhaPosicionada[];
  faixas: FaixaPosicionada[];
  largura: number;
  altura: number;
};

const ordemFaixa = new Map(FAIXAS_CAMINHO.map((f, i) => [f.id, i]));

function yDa(etapa: EtapaCaminho): number {
  return MARGEM + CABECALHO_FAIXA * ((ordemFaixa.get(etapa.faixa) ?? 0) + 1) + etapa.linha * PASSO_LINHA;
}

export function calcularLayoutCaminho(
  etapas: EtapaCaminho[],
  ligacoes: LigacaoCaminho[],
): LayoutCaminho {
  const posicionadas = etapas.map((etapa) => ({
    etapa,
    x: MARGEM + X_COLUNA[etapa.coluna],
    y: yDa(etapa),
  }));
  const porId = new Map(posicionadas.map((p) => [p.etapa.id, p]));

  const linhas: LinhaPosicionada[] = [];
  for (const ligacao of ligacoes) {
    const a = porId.get(ligacao.de);
    const b = porId.get(ligacao.para);
    if (!a || !b) continue;
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
      id: `${ligacao.de}->${ligacao.para}`,
      ligacao,
      d,
      rotulo: ligacao.rotulo
        ? { x: (x1 + x2) / 2, y: (y1 + y2) / 2, texto: ligacao.rotulo }
        : undefined,
    });
  }

  const faixas: FaixaPosicionada[] = FAIXAS_CAMINHO.map((f) => {
    const daFaixa = posicionadas.filter((p) => p.etapa.faixa === f.id);
    const topo = Math.min(...daFaixa.map((p) => p.y));
    const fundo = Math.max(...daFaixa.map((p) => p.y + ALTURA_ETAPA));
    return { ...f, y: topo - CABECALHO_FAIXA + 4, altura: fundo - topo + CABECALHO_FAIXA + 8 };
  });

  return {
    etapas: posicionadas,
    linhas,
    faixas,
    largura: Math.max(...posicionadas.map((p) => p.x + LARGURA_ETAPA)) + MARGEM,
    altura: Math.max(...posicionadas.map((p) => p.y + ALTURA_ETAPA)) + MARGEM,
  };
}
