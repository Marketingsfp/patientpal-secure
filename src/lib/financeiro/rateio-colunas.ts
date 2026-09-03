/**
 * Colunas do relatório Rateio da Receita.
 *
 * Ficam fora da tela porque a `chave` de cada coluna precisa casar exatamente
 * com o campo do objeto que `agruparRateio`/`compararRateio` devolvem — a
 * tabela, a folha impressa, o CSV e o Excel leem todos por essa chave. Já
 * houve um caso em que a coluna do agrupador apontava para um campo
 * inexistente ("agrupador" em vez de "rotulo") e a tela mostrava um traço no
 * lugar da data em todas as linhas, com os valores certos ao lado. Aqui o
 * casamento fica coberto por teste (`rateio-colunas.test.ts`).
 */
import type { RateioAgruparPor, RateioTipo } from "./rateio-receita";

export type FormatoColuna =
  | "texto"
  | "data"
  | "moeda"
  /**
   * Dinheiro que pode não existir naquela linha: a célula sai EM BRANCO em vez
   * de "R$ 0,00". Serve às colunas Valor Pago / Valor Recebido do relatório de
   * Movimentação Financeira, onde cada linha preenche uma e deixa a outra
   * vazia — com `moeda`, metade das células de um extrato de duas mil linhas
   * viraria zero e a conferência visual se perderia no meio deles. Na soma do
   * rodapé e na planilha continua sendo número.
   */
  | "moeda-opcional"
  | "numero"
  | "percentual"
  | "variacao-moeda"
  | "variacao-percentual";

export type ColunaRateio = {
  /** Campo lido na linha do relatório. */
  chave: string;
  rotulo: string;
  formato: FormatoColuna;
  /** Colunas de dinheiro somadas no rodapé da tabela e do papel. */
  somar?: boolean;
};

export const ROTULO_AGRUPADOR: Record<RateioAgruparPor, string> = {
  data: "Data",
  profissional: "Profissional",
  especialidade: "Especialidade",
};

/**
 * No sintético sai uma linha por agrupador; no analítico, uma por atendimento.
 * Com a comparação ligada entram as três colunas de confronto — só no
 * sintético, porque atendimento individual não tem par no outro período.
 */
export function colunasRateio(
  tipoRateio: RateioTipo,
  agruparPor: RateioAgruparPor,
  comparando: boolean,
): ColunaRateio[] {
  const comparacao: ColunaRateio[] = comparando
    ? [
        { chave: "receitaAnterior", rotulo: "Receita anterior", formato: "moeda", somar: true },
        { chave: "variacaoValor", rotulo: "Variação (R$)", formato: "variacao-moeda" },
        { chave: "variacaoPercentual", rotulo: "Variação (%)", formato: "variacao-percentual" },
      ]
    : [];
  const dinheiro: ColunaRateio[] = [
    { chave: "receita", rotulo: "Receita bruta", formato: "moeda", somar: true },
    ...comparacao,
    { chave: "repasse", rotulo: "Repasse prestador", formato: "moeda", somar: true },
    { chave: "liquido", rotulo: "Líquido clínica", formato: "moeda", somar: true },
    { chave: "margem", rotulo: "% clínica", formato: "percentual" },
  ];
  if (tipoRateio === "sintetico") {
    return [
      {
        // `rotulo` é o campo que sai de `agruparRateio`: a data (YYYY-MM-DD)
        // quando o agrupamento é por data, o nome do médico ou da
        // especialidade nos outros casos.
        chave: "rotulo",
        rotulo: ROTULO_AGRUPADOR[agruparPor],
        formato: agruparPor === "data" ? "data" : "texto",
      },
      // Agrupado por profissional a especialidade vem junto, como no
      // analítico: é por ela que o financeiro separa os repasses no
      // fechamento. Nos outros agrupamentos ela seria redundante (já é o
      // próprio agrupador) ou misturada (uma data tem várias).
      ...(agruparPor === "profissional"
        ? ([
            { chave: "especialidade_nome", rotulo: "Especialidade", formato: "texto" },
          ] as ColunaRateio[])
        : []),
      { chave: "qtd", rotulo: "Qtd. atend.", formato: "numero" },
      ...dinheiro,
    ];
  }
  return [
    { chave: "data", rotulo: "Data", formato: "data" },
    { chave: "medico_nome", rotulo: "Profissional", formato: "texto" },
    { chave: "especialidade_nome", rotulo: "Especialidade", formato: "texto" },
    { chave: "procedimento", rotulo: "Serviço", formato: "texto" },
    { chave: "receita", rotulo: "Receita bruta", formato: "moeda", somar: true },
    { chave: "repasse", rotulo: "Repasse prestador", formato: "moeda", somar: true },
    { chave: "liquido", rotulo: "Líquido clínica", formato: "moeda", somar: true },
    { chave: "margem", rotulo: "% clínica", formato: "percentual" },
  ];
}
