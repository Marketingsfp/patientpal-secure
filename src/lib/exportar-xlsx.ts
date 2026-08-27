/**
 * Exportação de relatório em Excel de verdade (.xlsx).
 *
 * A clínica já tinha `exportToExcel` (src/lib/export-csv.ts), mas aquilo é um
 * CSV com BOM: abre no Excel e serve para conferir, só que chega sem tipos —
 * valor em reais entra como texto, e ninguém consegue somar uma coluna nem
 * usar filtro sem antes converter tudo à mão. Aqui a planilha sai nativa, com
 * número como número, cabeçalho congelado e autofiltro já ligado.
 *
 * O SheetJS entra por `import()` dinâmico: são centenas de kB que só fazem
 * sentido no clique de "Baixar Excel", não no carregamento da tela.
 */

/** Uma coluna da planilha. */
export type ColunaXlsx = {
  /** Cabeçalho da coluna. */
  rotulo: string;
  /** Como o Excel deve tratar os valores dessa coluna. */
  tipo?: "texto" | "moeda" | "numero" | "percentual" | "data";
  /** Largura em caracteres; se ausente, é calculada pelo conteúdo. */
  largura?: number;
};

export type PlanilhaRelatorio = {
  /** Nome do arquivo, com ou sem a extensão. */
  arquivo: string;
  /** Nome da aba (o Excel corta em 31 caracteres e proíbe : \ / ? * [ ]). */
  aba?: string;
  /** Linhas de contexto acima da tabela (título, período, filtros aplicados). */
  cabecalho?: string[];
  colunas: ColunaXlsx[];
  /** Valores crus: número nas colunas numéricas, texto no resto. */
  linhas: Array<Array<string | number | null>>;
  /** Linha de totais, na mesma ordem das colunas. */
  totais?: Array<string | number | null>;
  /**
   * Bloco de duas colunas (rótulo + valor) abaixo da tabela, separado dela por
   * uma linha em branco. É onde entra a composição da receita por forma de
   * pagamento: quem abre a planilha vê a mesma quebra que a tela mostra no
   * card, sem precisar montar uma tabela dinâmica para chegar nela.
   *
   * Fica FORA da tabela de propósito — não entra no autofiltro nem herda o
   * formato numérico das colunas, que são de outro assunto.
   */
  resumo?: {
    /** Ex.: "Composição por forma de pagamento". */
    titulo?: string;
    itens: Array<{ rotulo: string; valor: string | number; tipo?: ColunaXlsx["tipo"] }>;
  };
};

export type CelulaXlsx = string | number | null;

/** Formatos numéricos do Excel, em português (R$ e separador de milhar). */
const FORMATO: Record<string, string | undefined> = {
  moeda: "R$ #,##0.00;[Red]-R$ #,##0.00",
  numero: "#,##0",
  percentual: '0.0"%"',
  data: "dd/mm/yyyy",
  texto: undefined,
};

/** O Excel recusa aba com esses caracteres e corta o nome em 31 posições. */
export const nomeDeAbaValido = (nome: string) =>
  (nome.replace(/[:\\/?*[\]]/g, "-").trim() || "Relatório").slice(0, 31);

/**
 * Monta a matriz de células da planilha e diz em que linha começa a tabela
 * (as linhas de contexto vêm antes). Separado da gravação para poder ser
 * testado sem tocar em disco nem carregar o SheetJS.
 */
export function montarMatrizRelatorio(p: PlanilhaRelatorio): {
  matriz: CelulaXlsx[][];
  linhaCabecalho: number;
  /** Última linha que ainda faz parte da tabela (totais inclusos). */
  ultimaLinhaDaTabela: number;
  /** Onde cada item do resumo foi parar, para formatar o valor um a um. */
  linhasDoResumo: Array<{ linha: number; tipo?: ColunaXlsx["tipo"] }>;
} {
  const matriz: CelulaXlsx[][] = [];
  for (const linha of p.cabecalho ?? []) matriz.push([linha]);
  if (p.cabecalho?.length) matriz.push([]);
  const linhaCabecalho = matriz.length;
  matriz.push(p.colunas.map((c) => c.rotulo));
  for (const linha of p.linhas) matriz.push(linha);
  if (p.totais) matriz.push(p.totais);
  const ultimaLinhaDaTabela = matriz.length - 1;

  const linhasDoResumo: Array<{ linha: number; tipo?: ColunaXlsx["tipo"] }> = [];
  if (p.resumo?.itens.length) {
    matriz.push([]);
    if (p.resumo.titulo) matriz.push([p.resumo.titulo]);
    for (const item of p.resumo.itens) {
      linhasDoResumo.push({ linha: matriz.length, tipo: item.tipo });
      matriz.push([item.rotulo, item.valor]);
    }
  }
  return { matriz, linhaCabecalho, ultimaLinhaDaTabela, linhasDoResumo };
}

/** Largura de cada coluna, em caracteres. */
export function largurasDasColunas(p: PlanilhaRelatorio): number[] {
  return p.colunas.map((coluna, c) => {
    if (coluna.largura) return coluna.largura;
    let maior = String(coluna.rotulo ?? "").length;
    for (const linha of p.linhas) maior = Math.max(maior, String(linha[c] ?? "").length);
    // Piso de 10 para a coluna não encostar no cabeçalho; teto de 46 para um
    // nome de serviço comprido não empurrar as colunas de dinheiro para fora
    // da folha quando alguém imprimir a planilha.
    return Math.min(46, Math.max(10, maior + 2));
  });
}

/**
 * Monta e baixa a planilha. Roda só no navegador — é ele quem tem o clique do
 * usuário e a pasta de downloads.
 */
export async function exportarRelatorioXlsx(p: PlanilhaRelatorio): Promise<void> {
  const XLSX = await import("xlsx");
  const { matriz, linhaCabecalho, ultimaLinhaDaTabela, linhasDoResumo } = montarMatrizRelatorio(p);
  const aba = XLSX.utils.aoa_to_sheet(matriz);

  const formatar = (l: number, c: number, formato?: string) => {
    if (!formato) return;
    const celula = (aba as Record<string, unknown>)[XLSX.utils.encode_cell({ r: l, c })] as
      | { v?: unknown; z?: string }
      | undefined;
    if (celula && typeof celula.v === "number") celula.z = formato;
  };

  // Formato de número célula a célula: o SheetJS não aceita formato por coluna.
  for (let c = 0; c < p.colunas.length; c++) {
    const formato = FORMATO[p.colunas[c].tipo ?? "texto"];
    if (!formato) continue;
    for (let l = linhaCabecalho + 1; l <= ultimaLinhaDaTabela; l++) formatar(l, c, formato);
  }
  // O resumo tem formato próprio: ele fica abaixo da tabela e o valor dele não
  // tem nada a ver com o tipo da 2ª coluna do relatório.
  for (const item of linhasDoResumo) formatar(item.linha, 1, FORMATO[item.tipo ?? "texto"]);

  aba["!cols"] = largurasDasColunas(p).map((wch) => ({ wch }));
  // Cabeçalho congelado e autofiltro: a tabela passa de mil linhas com
  // frequência e, sem isso, a rolagem perde os títulos das colunas.
  (aba as Record<string, unknown>)["!freeze"] = { xSplit: 0, ySplit: linhaCabecalho + 1 };
  aba["!autofilter"] = {
    ref: XLSX.utils.encode_range(
      { r: linhaCabecalho, c: 0 },
      { r: ultimaLinhaDaTabela, c: Math.max(0, p.colunas.length - 1) },
    ),
  };

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba, nomeDeAbaValido(p.aba ?? "Relatório"));
  const arquivo = p.arquivo.endsWith(".xlsx") ? p.arquivo : `${p.arquivo}.xlsx`;
  XLSX.writeFile(livro, arquivo, { bookType: "xlsx", compression: true });
}
