/**
 * Paginação das consultas do financeiro — em ondas paralelas.
 *
 * Por que existe
 * --------------
 * O PostgREST devolve no máximo 1.000 linhas por requisição, e o financeiro
 * lê períodos grandes: em setembro de 2026, o mês inteiro da Policlínica
 * Menino Jesus são 5.633 pagamentos de agenda, 7.003 lançamentos e 6.549
 * movimentos de caixa. Cada carregador tinha o seu próprio laço que pedia a
 * página, ESPERAVA a resposta, e só então pedia a seguinte. Somando as quatro
 * telas do módulo davam cerca de 30 idas ao banco em fila indiana, e a
 * recepção esperava mais de 15 segundos para o Dashboard ou o Movimento de
 * Caixa aparecerem.
 *
 * Aqui as páginas são pedidas em ONDAS: `PAGINAS_POR_ONDA` de uma vez. As
 * mesmas 8 páginas que saíam em 8 idas sequenciais saem em 2 ondas.
 *
 * O que continua garantido
 * ------------------------
 *  - **A ordem.** As páginas são remontadas pelo número delas, não pela ordem
 *    em que as respostas chegarem. O resultado é idêntico ao do laço antigo —
 *    e isso importa: a Movimentação Financeira lista por data e hora, e uma
 *    página fora de lugar bagunçaria o extrato.
 *  - **O fim da lista.** Uma página que volta com menos linhas que o tamanho
 *    pedido é a última. As páginas da mesma onda que vierem depois dela voltam
 *    vazias e são descartadas — pedir a mais é desperdício de rede, nunca
 *    linha a mais na conta.
 *  - **O teto.** `maxPaginas` continua sendo a trava contra um período aberto
 *    por engano (um ano inteiro) baixar o histórico inteiro da clínica para o
 *    navegador.
 *  - **O erro.** Qualquer página que falhe derruba a leitura inteira, como
 *    antes. Devolver meia lista seria mostrar um total menor que o real, que é
 *    o pior defeito possível numa tela de dinheiro.
 */

/**
 * Quantas páginas são pedidas ao mesmo tempo.
 *
 * Quatro é o meio-termo: cobre em uma só onda quase todo período de um mês
 * (7.003 lançamentos = 8 páginas = 2 ondas) sem disparar dezenas de
 * requisições simultâneas para o mesmo servidor quando alguém abre um
 * trimestre.
 */
export const PAGINAS_POR_ONDA = 4;

/** O que uma consulta paginável precisa oferecer. */
export interface ConsultaPaginavel<T> {
  range: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
}

export interface OpcoesPaginacao {
  /** Linhas por página. O PostgREST não devolve mais de 1.000. */
  pagina?: number;
  /** Teto de páginas — a trava contra período aberto por engano. */
  maxPaginas?: number;
  /** Páginas pedidas ao mesmo tempo. */
  porOnda?: number;
}

/**
 * Lê todas as páginas de uma consulta e devolve as linhas numa lista só.
 *
 * `montar` é chamada uma vez por página e deve devolver uma consulta NOVA —
 * o cliente do Supabase não permite reaproveitar a mesma para dois `range`.
 */
export async function buscarPaginado<T>(
  montar: () => ConsultaPaginavel<T>,
  { pagina = 1000, maxPaginas = 50, porOnda = PAGINAS_POR_ONDA }: OpcoesPaginacao = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let inicio = 0; inicio < maxPaginas; inicio += porOnda) {
    const nesta = Math.min(porOnda, maxPaginas - inicio);
    const lotes = await Promise.all(
      Array.from({ length: nesta }, async (_, i) => {
        const p = inicio + i;
        const { data, error } = await montar().range(p * pagina, (p + 1) * pagina - 1);
        if (error) throw error;
        return (data ?? []) as T[];
      }),
    );
    // Remonta na ordem das páginas, não na ordem em que as respostas chegaram.
    let acabou = false;
    for (const lote of lotes) {
      if (acabou) break;
      out.push(...lote);
      if (lote.length < pagina) acabou = true;
    }
    if (acabou) return out;
  }
  return out;
}

/**
 * Roda em paralelo uma consulta que vai em lotes de ids (`.in(...)`).
 *
 * Mesmo motivo do `buscarPaginado`: os nomes dos 618 pacientes de um mês
 * saíam em três consultas em fila indiana. `tamanho` é menor que a página
 * porque a lista de ids viaja na URL da consulta.
 */
export async function buscarPorLotes<T>(
  ids: string[],
  tamanho: number,
  buscar: (lote: string[]) => PromiseLike<T[]>,
): Promise<T[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += tamanho) lotes.push(ids.slice(i, i + tamanho));
  const resultados = await Promise.all(lotes.map((l) => buscar(l)));
  return resultados.flat();
}
