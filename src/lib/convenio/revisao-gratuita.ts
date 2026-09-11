/**
 * Definição ÚNICA de "revisão gratuita".
 *
 * A revisão (ou retorno) sem preço é direito do paciente — já foi paga na
 * consulta de origem. Para paciente particular a Agenda já resolvia isso
 * sozinha (linha "SEM COBRANÇA" quando o serviço não tem valor). Já o paciente
 * com Cartão Consulta era COBRADO: as regras do convênio para o tipo
 * "consulta" (ex.: R$ 9,99, R$ 80,00, R$ 95,00) também casavam com a REVISAO,
 * que é cadastrada como consulta. Resultado: o cartão dava preço a um serviço
 * que custa R$ 0,00 no particular — mais caro do que não ter cartão.
 *
 * Só entra aqui o serviço cujo nome, sem o sufixo de especialidade que a agenda
 * acrescenta ("REVISAO (GINECOLOGIA)"), sem acento e em maiúsculas, é
 * EXATAMENTE "REVISAO" ou "RETORNO", **e** que está com todas as colunas de
 * preço zeradas ou nulas.
 *
 * Ficam de fora, propositalmente, serviços que têm preço — "REVISAO 50%",
 * "REVISAO 50% DIFERENCIADA", "CONSULTA DE RETORNO" — e serviços zerados com
 * outro nome (exames de laboratório, "CONSULTA 110 E 130").
 */

/** Colunas de preço do cadastro de serviços consideradas na checagem. */
export type PrecosCadastro = {
  valor_padrao?: number | string | null;
  valor_dinheiro?: number | string | null;
  valor_dinheiro_pix?: number | string | null;
  valor_pix?: number | string | null;
  valor_cartao?: number | string | null;
  valor_cartao_credito?: number | string | null;
  valor_cartao_debito?: number | string | null;
};

/** Colunas de preço a trazer do cadastro quando a checagem for usada. */
export const COLUNAS_PRECO_REVISAO =
  "valor_padrao,valor_dinheiro,valor_dinheiro_pix,valor_pix,valor_cartao,valor_cartao_credito,valor_cartao_debito";

/**
 * Nome do serviço sem o sufixo de especialidade, sem acento e em maiúsculas.
 * É a mesma normalização usada nos demais pontos do motor de convênio.
 */
export function normalizarNomeServico(nome: string | null | undefined): string {
  return (nome ?? "")
    .replace(/\s*\([^()]*\)\s*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const NOMES_REVISAO = new Set(["REVISAO", "RETORNO"]);

/** true quando todas as colunas de preço do cadastro estão zeradas/nulas. */
export function precosTodosZerados(precos: PrecosCadastro | null | undefined): boolean {
  if (!precos) return false;
  const valores = [
    precos.valor_padrao,
    precos.valor_dinheiro,
    precos.valor_dinheiro_pix,
    precos.valor_pix,
    precos.valor_cartao,
    precos.valor_cartao_credito,
    precos.valor_cartao_debito,
  ];
  return valores.every((v) => {
    const n = Number(v);
    return !Number.isFinite(n) || n === 0;
  });
}

/**
 * Revisão/retorno gratuito: nome exatamente "REVISAO"/"RETORNO" e cadastro sem
 * nenhum valor. Qualquer outro caso devolve false e segue a regra do convênio.
 */
export function ehRevisaoGratuita(
  nomeServico: string | null | undefined,
  precosDoCadastro: PrecosCadastro | null | undefined,
): boolean {
  if (!NOMES_REVISAO.has(normalizarNomeServico(nomeServico))) return false;
  return precosTodosZerados(precosDoCadastro);
}
