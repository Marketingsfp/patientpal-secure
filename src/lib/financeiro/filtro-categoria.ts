/**
 * Filtro por Categoria dos relatórios do Financeiro.
 *
 * O financeiro audita o mês categoria por categoria ("quero ver só PARTICULAR",
 * "quero só REPASSE MEDICO"), e até aqui a única saída era exportar tudo e
 * filtrar no Excel. Este módulo é a regra desse recorte, compartilhada pelos
 * dois relatórios que a usam — Rateio da Receita e Movimentação Financeira —,
 * para que o mesmo nome escolhido signifique a mesma coisa nos dois.
 *
 * Duas decisões que valem para os dois relatórios:
 *
 *  - **Seleção vazia é "todas as categorias"**, e não "nenhuma". É o estado em
 *    que a tela nasce, e é o que faz o relatório continuar abrindo completo
 *    para quem nunca tocar no seletor.
 *  - **A comparação é feita em CAIXA ALTA e sem espaços nas pontas.** O
 *    cadastro de produção tem a mesma conta escrita de jeitos diferentes
 *    ("Boletos" e "BOLETOS"), e o nome é o que liga a linha à opção escolhida:
 *    sem normalizar, metade das linhas ficaria de fora do próprio filtro.
 *
 * O recorte é sempre feito em MEMÓRIA, sobre a lista que já foi carregada —
 * trocar de categoria não vai ao banco de novo, do mesmo jeito que trocar
 * entre sintético e analítico. Por isso este arquivo é puro e não conhece o
 * Supabase.
 */

/** Rótulo usado quando a linha não tem categoria e nem dá para deduzi-la. */
export const SEM_CATEGORIA = "(SEM CATEGORIA)";

/**
 * Categorias escolhidas na tela. Lista VAZIA = todas — ver o cabeçalho.
 * Os nomes são guardados já normalizados por `chaveCategoria`.
 */
export type SelecaoCategorias = string[];

/** Nome comparável de uma categoria (caixa alta, sem espaços nas pontas). */
export const chaveCategoria = (nome: string | null | undefined): string =>
  String(nome ?? "")
    .trim()
    .toUpperCase();

/**
 * Recorta a lista pelas categorias escolhidas.
 *
 * `categoriaDe` é quem sabe extrair a categoria de cada item — no extrato ela
 * é deduzida da descrição quando o lançamento não tem uma; no rateio ela vem
 * gravada na linha. A regra do recorte é a mesma nos dois casos, e é isso que
 * este parâmetro permite compartilhar.
 */
export function filtrarPorCategoria<T>(
  itens: T[],
  selecionadas: SelecaoCategorias,
  categoriaDe: (item: T) => string,
): T[] {
  if (selecionadas.length === 0) return itens;
  const alvo = new Set(selecionadas.map(chaveCategoria));
  return itens.filter((i) => alvo.has(chaveCategoria(categoriaDe(i))));
}

/**
 * Lista do seletor: o cadastro de Financeiro → Categorias somado ao que
 * apareceu no período carregado.
 *
 * As duas fontes são necessárias. Só o cadastro deixaria de fora as categorias
 * que o relatório DEDUZ e que não têm linha em `fin_categorias` — a
 * transferência entre caixas (sangria e suprimento) e o próprio
 * `(SEM CATEGORIA)`; só o que apareceu no período deixaria o seletor vazio
 * antes do primeiro "Buscar", e quem abre a tela precisa escolher a categoria
 * ANTES de buscar.
 *
 * `(SEM CATEGORIA)` desce sempre para o fim, mesmo sendo grande: ali é
 * pendência de cadastro, não uma conta de verdade — a mesma regra que a visão
 * sintética do extrato já usa na tabela.
 */
export function opcoesDeCategoria(cadastro: string[], presentes: string[]): string[] {
  const vistas = new Set<string>();
  for (const nome of [...cadastro, ...presentes]) {
    const chave = chaveCategoria(nome);
    if (chave) vistas.add(chave);
  }
  return Array.from(vistas).sort((a, b) => {
    const aFim = a === SEM_CATEGORIA;
    const bFim = b === SEM_CATEGORIA;
    if (aFim !== bFim) return aFim ? 1 : -1;
    return a.localeCompare(b, "pt-BR");
  });
}

/**
 * Texto do botão do seletor.
 *
 * Com uma categoria escolhida o nome dela aparece inteiro — é a informação
 * mais importante da barra de filtros nesse momento. A partir de duas o botão
 * não comportaria a lista sem truncar no meio de um nome, então vira a
 * contagem, e a lista completa fica no cabeçalho do papel e da planilha.
 */
export function rotuloSelecao(selecionadas: SelecaoCategorias): string {
  if (selecionadas.length === 0) return "TODAS AS CATEGORIAS";
  if (selecionadas.length === 1) return chaveCategoria(selecionadas[0]);
  return `${selecionadas.length} categorias`;
}

/**
 * Linha de contexto do cabeçalho impresso/exportado.
 *
 * Vazio quando nada foi filtrado: uma folha que diz "Categoria: todas" gasta
 * uma linha para não informar nada. Quando HÁ recorte, o nome de cada
 * categoria vai escrito — sem isso, uma folha com um total menor circula sem
 * dizer por que o total é menor, e é exatamente essa a dúvida de quem confere.
 */
export function descricaoSelecao(selecionadas: SelecaoCategorias): string {
  if (selecionadas.length === 0) return "";
  return `Categoria: ${selecionadas.map(chaveCategoria).join(", ")}`;
}
