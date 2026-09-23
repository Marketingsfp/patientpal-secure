/**
 * Cache curto das leituras pesadas do financeiro.
 *
 * Por que existe
 * --------------
 * Cada aba do Financeiro é uma tela separada. Sair do Dashboard e voltar —
 * ou pular para Mov. Caixa, Relatórios, Estatísticas — desmontava a tela,
 * jogava tudo fora e refazia a leitura inteira do período: em setembro de
 * 2026, cerca de 20 mil linhas e dezenas de consultas, mais de 15 segundos de
 * espera para a recepção ver de novo um número que estava na tela um segundo
 * antes.
 *
 * Aqui o resultado de um período fica guardado por pouco tempo, fora do
 * React, para sobreviver à troca de tela. A segunda aba encontra o número
 * pronto.
 *
 * Por que isto NÃO deixa o número velho na tela
 * ---------------------------------------------
 *  - O prazo é curto (`TTL_PERIODO`), bem menor que os 2 minutos que o
 *    Dashboard já espera entre uma atualização automática e outra. O pior
 *    caso do cache é mais novo que o pior caso que a tela já aceitava antes.
 *  - Quem pede a leitura de propósito — a atualização automática, o botão
 *    "Atualizar agora", e a releitura depois de lançar uma receita ou uma
 *    despesa — passa `forcar` e ignora o que está guardado.
 *  - Quem grava pode chamar `limparCacheFinanceiro()` e derrubar tudo na
 *    hora.
 *
 * O que fica guardado é a PROMESSA, não só o resultado: duas telas que pedem
 * o mesmo período ao mesmo tempo dividem uma consulta só, em vez de fazerem
 * duas. Leitura que falha não fica guardada — a próxima tentativa vai ao
 * banco de novo.
 */

/** Prazo das leituras por período (receita, despesas, recorte do caixa). */
export const TTL_PERIODO = 60_000;

/**
 * Prazo dos catálogos da clínica — médicos, especialidades, serviços, grade
 * de repasse, categorias. Mudam raramente e são os mesmos em todas as abas,
 * então valem mais tempo. É o mesmo prazo do cache dos valores dos serviços.
 */
export const TTL_CATALOGO = 5 * 60_000;

/**
 * Quantos períodos ficam guardados ao mesmo tempo.
 *
 * Segura o caso de alguém passear pelo seletor de período sem fazer a memória
 * do navegador crescer sem fim. O mais antigo sai primeiro.
 */
const MAX_ENTRADAS = 12;

interface Entrada {
  em: number;
  valor: Promise<unknown>;
}

const cache = new Map<string, Entrada>();

/**
 * Devolve o valor guardado para `chave`, ou executa `buscar` e guarda.
 *
 * `forcar` ignora o que estiver guardado e relê — é o caminho da atualização
 * automática e do botão "Atualizar agora".
 */
export function comCache<T>(
  chave: string,
  ttlMs: number,
  buscar: () => Promise<T>,
  forcar = false,
): Promise<T> {
  const agora = Date.now();
  const atual = cache.get(chave);
  if (!forcar && atual && agora - atual.em < ttlMs) {
    // Recoloca no fim: o que está em uso não é o primeiro a ser descartado.
    cache.delete(chave);
    cache.set(chave, atual);
    return atual.valor as Promise<T>;
  }

  const valor = buscar().catch((e) => {
    // Falha não fica guardada: a tela tentar de novo tem que ir ao banco.
    if (cache.get(chave)?.valor === valor) cache.delete(chave);
    throw e;
  });
  cache.set(chave, { em: agora, valor });
  while (cache.size > MAX_ENTRADAS) {
    const maisAntiga = cache.keys().next();
    if (maisAntiga.done) break;
    cache.delete(maisAntiga.value);
  }
  return valor;
}

/**
 * Esquece o que está guardado.
 *
 * Sem argumento, esquece tudo. Com `prefixo`, só as chaves que começam com
 * ele — serve para derrubar um período ou uma clínica sem mexer no resto.
 */
export function limparCacheFinanceiro(prefixo?: string): void {
  if (!prefixo) {
    cache.clear();
    return;
  }
  for (const chave of Array.from(cache.keys())) {
    if (chave.startsWith(prefixo)) cache.delete(chave);
  }
}

/** Quantas entradas estão guardadas. Só para teste e diagnóstico. */
export const tamanhoDoCacheFinanceiro = (): number => cache.size;
