/**
 * Ordenação por relevância para as buscas de serviço/procedimento.
 *
 * O catálogo da clínica tem milhares de nomes e muitos deles contêm a mesma
 * palavra (só "CONSULTA" aparece em dezenas). Filtrar por `includes` e manter
 * a ordem do cadastro fazia o serviço mais óbvio — o de nome exatamente igual
 * ao que foi digitado — cair no meio de uma lista rolável, dando a impressão
 * de que ele "não existe". Aqui a correspondência mais exata sobe para o topo.
 */

export const normalizarBusca = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Remove o sufixo entre parênteses que a Agenda acrescenta ao nome do serviço
 * para indicar a especialidade ("CONSULTA (ORTOPEDIA)"). Sem isso, digitar
 * "CONSULTA" nunca daria correspondência exata na tela de Agendas.
 */
const semSufixoEntreParenteses = (s: string) => s.replace(/\s*\([^()]*\)\s*$/, "").trim();

/** Verifica se a busca começa numa fronteira de palavra dentro do alvo. */
const comecaPalavra = (alvo: string, consulta: string) => {
  let i = alvo.indexOf(consulta);
  while (i !== -1) {
    if (i === 0 || !/[a-z0-9]/.test(alvo[i - 1])) return true;
    i = alvo.indexOf(consulta, i + 1);
  }
  return false;
};

/**
 * Pontua o quanto `texto` corresponde à busca já normalizada. 0 = não casa.
 * Quanto maior, mais próximo do que foi digitado.
 */
export function pontuarRelevancia(texto: string, consultaNormalizada: string): number {
  if (!consultaNormalizada) return 1;
  const alvo = normalizarBusca(texto);
  if (!alvo.includes(consultaNormalizada)) return 0;
  const nucleo = semSufixoEntreParenteses(alvo);
  if (alvo === consultaNormalizada || nucleo === consultaNormalizada) return 100;
  if (alvo.startsWith(consultaNormalizada) || nucleo.startsWith(consultaNormalizada)) return 80;
  if (comecaPalavra(alvo, consultaNormalizada)) return 60;
  return 40;
}

/**
 * Filtra e ordena por relevância. Empates ficam com o nome mais curto primeiro
 * (o serviço "puro" antes das variações) e, persistindo o empate, preservam a
 * ordem original — que na Agenda é a ordem do cadastro do médico.
 */
export function ordenarPorRelevancia<T>(
  itens: readonly T[],
  consulta: string,
  texto: (item: T) => string,
): T[] {
  const q = normalizarBusca(consulta);
  if (!q) return [...itens];
  const marcados: { item: T; pontos: number; tamanho: number; ordem: number }[] = [];
  itens.forEach((item, ordem) => {
    const alvo = texto(item);
    const pontos = pontuarRelevancia(alvo, q);
    if (pontos <= 0) return;
    marcados.push({ item, pontos, tamanho: normalizarBusca(alvo).length, ordem });
  });
  marcados.sort((a, b) => b.pontos - a.pontos || a.tamanho - b.tamanho || a.ordem - b.ordem);
  return marcados.map((m) => m.item);
}
