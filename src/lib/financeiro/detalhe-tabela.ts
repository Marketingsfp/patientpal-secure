/**
 * Tabela de detalhamento dos cards do Financeiro (Dashboard e Movimento de
 * Caixa): o mesmo formato serve para a tela, o papel e a planilha.
 *
 * Mora em `lib`, e não no componente que a desenha, porque também é gravada
 * para a aba nova do detalhamento (ver `detalhe-aba.ts`) — e precisa ser
 * dado puro, que atravessa o armazenamento do navegador sem perder nada.
 */
export type Visao = "sintetico" | "analitico";
export type TipoCol = "texto" | "moeda" | "numero" | "data";
export type Celula = string | number | null;

/** Uma tabela de detalhamento, pronta para tela, papel e planilha. */
export interface Detalhe {
  titulo: string;
  explicacao: string;
  colunas: Array<{ rotulo: string; tipo: TipoCol }>;
  linhas: Celula[][];
  totais?: Celula[];
  /** Quadro de fechamento, acima da tabela e no papel. */
  resumo?: Array<{ rotulo: string; valor: number }>;
  /** Quebra por forma de pagamento (só na receita). */
  composicao?: Array<{ rotulo: string; valor: number }>;
  /** Existe visão sintética (agrupada) além da lista. */
  temSintetico: boolean;
}
