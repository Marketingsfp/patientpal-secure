/**
 * Desempate único entre contratos ATIVOS do Cartão Benefícios.
 *
 * O problema que isto resolve: um paciente pode ser dependente ativo em mais
 * de um contrato ativo ao mesmo tempo (a recepção vende um cartão novo e o
 * vínculo antigo continua ligado). Os quatro pontos que decidem convênio,
 * preço e bloqueio por inadimplência faziam, cada um por conta própria:
 *
 *     .limit(5)                       // sem .order()
 *     lista.find((c) => c.convenio_id) ?? lista[0]
 *
 * Sem `ORDER BY`, a ordem das linhas não é garantida pelo Postgres — então
 * qual cartão valia para o paciente era sorteio a cada abertura da tela. No
 * caso que motivou a correção, um paciente cadastrado num cartão novo hoje
 * aparecia bloqueado por R$ 310,00 de um cartão antigo de OUTRO titular, em
 * que ele também constava como dependente.
 *
 * A regra passa a ser, nesta ordem:
 *
 *   1. contrato COM convênio vinculado vence contrato sem convênio — existem
 *      contratos legados com `convenio_id` nulo, criados pelo vínculo
 *      automático titular–dependente da importação; quando um deles vinha
 *      primeiro, o paciente perdia o desconto do cartão que de fato possui;
 *   2. `data_inicio` mais recente;
 *   3. `created_at` mais recente.
 *
 * Ou seja: entre cartões ativos, vale o mais novo — o que a recepção acabou
 * de vender. Chamar sempre esta função (em vez de repetir o `.find`) mantém
 * Agenda, Caixa, classificação de atendimento e cálculo de repasse decidindo
 * pelo MESMO contrato; divergência entre eles já custou cobrança com a tabela
 * de preço errada.
 */

export type ContratoOrdenavel = {
  convenio_id?: unknown;
  data_inicio?: unknown;
  created_at?: unknown;
};

/**
 * Converte `data_inicio` ("YYYY-MM-DD") ou `created_at` (timestamp) em número
 * comparável. Valor ausente ou inválido vira o menor possível, para que um
 * contrato sem data nunca ganhe de um contrato com data.
 */
function instante(valor: unknown): number {
  if (typeof valor !== "string" || valor.length === 0) return Number.NEGATIVE_INFINITY;
  // Data pura precisa de hora explícita: `new Date("2026-08-27")` é lido como
  // UTC e, no Brasil, volta como 26/08 às 21h.
  const texto = valor.length <= 10 ? `${valor}T00:00:00` : valor;
  const ms = new Date(texto).getTime();
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/** Ordena do contrato que deve valer para o que não deve. */
export function compararContratosAtivos(a: ContratoOrdenavel, b: ContratoOrdenavel): number {
  const temConvenioA = a?.convenio_id ? 1 : 0;
  const temConvenioB = b?.convenio_id ? 1 : 0;
  if (temConvenioA !== temConvenioB) return temConvenioB - temConvenioA;

  const porInicio = instante(b?.data_inicio) - instante(a?.data_inicio);
  if (porInicio !== 0) return porInicio;

  return instante(b?.created_at) - instante(a?.created_at);
}

/**
 * Escolhe qual contrato ativo vale para o paciente. Devolve `null` quando a
 * lista está vazia.
 *
 * O desempate é feito aqui, em memória, e não com `.order()` no PostgREST, de
 * propósito: no caminho do dependente o contrato vem embutido
 * (`contratos_assinatura!inner(...)`), e ordenar a linha de fora por uma
 * coluna da tabela embutida depende da versão do PostgREST. Ordenar a lista
 * curta que já foi baixada dá o mesmo resultado sem esse risco.
 */
export function escolherContratoAtivo<T extends ContratoOrdenavel>(
  lista: ReadonlyArray<T | null | undefined>,
): T | null {
  const validos = lista.filter((c): c is T => !!c);
  if (validos.length === 0) return null;
  return [...validos].sort(compararContratosAtivos)[0] ?? null;
}

/**
 * Quantas linhas baixar antes de desempatar. O `.limit(5)` anterior era
 * apertado o bastante para, num paciente com muitos vínculos, cortar
 * justamente o contrato mais novo antes de qualquer ordenação.
 */
export const LIMITE_CONTRATOS_CANDIDATOS = 20;

/**
 * Titular que só paga: o contrato tem uma marcação
 * (`titular_apenas_financeiro`) para quem assina e paga a mensalidade do
 * cartão SEM ser beneficiário — tipicamente o filho que compra o cartão para
 * o pai e a mãe. Nesse caso os beneficiários são apenas os dependentes ativos.
 *
 * O campo já existia e era respeitado na contagem de vidas
 * (`vidas-contrato.ts`) e na impressão do cartão, mas NÃO nos pontos que
 * decidem preço. Caso real que motivou a correção: a paciente aparecia como
 * titular apenas financeiro de um cartão comprado para os pais e, na consulta
 * dela, a Agenda e o Caixa aplicavam a tabela do convênio — R$ 10,00 numa
 * consulta de endocrinologia que custa R$ 120,00 particular.
 *
 * Regra: ser pagador do plano não estende benefício. Só recebe a tabela do
 * convênio quem é titular beneficiário OU dependente ativo do contrato.
 */
export type ContratoComTitular = { titular_apenas_financeiro?: unknown };

/**
 * `true` quando o contrato vale como benefício PARA O PRÓPRIO TITULAR.
 * Não afeta os dependentes: o contrato continua valendo para eles.
 */
export function titularUsaBeneficio(contrato: ContratoComTitular | null | undefined): boolean {
  return !!contrato && contrato.titular_apenas_financeiro !== true;
}

/**
 * Descarta, de uma lista de contratos em que o paciente é TITULAR, aqueles em
 * que ele é apenas o responsável financeiro. Use nas telas que já baixaram os
 * contratos em lote e não podem filtrar na consulta ao banco.
 */
export function filtrarTitularesBeneficiarios<T extends ContratoComTitular>(
  lista: ReadonlyArray<T | null | undefined>,
): T[] {
  return lista.filter((c): c is T => titularUsaBeneficio(c));
}

