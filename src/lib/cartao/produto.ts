/**
 * Cartão Benefícios × Cartão Terapêutico.
 *
 * São o MESMO conjunto de telas e as MESMAS tabelas: o que separa os dois é a
 * coluna `produto` do convênio (`cb_convenios.produto`). Cada módulo enxerga
 * apenas os convênios do seu produto e os contratos ligados a eles.
 *
 * Contrato antigo sem convênio (`convenio_id` nulo) continua no Cartão
 * Benefícios — é onde a aba "Sem convênio" sempre esteve.
 */

export type ProdutoCartao = "beneficios" | "terapeutico";
export type ModuloCartao = "cartao-beneficios" | "cartao-terapeutico";

export function produtoDoModulo(modulo: string): ProdutoCartao {
  return modulo === "cartao-terapeutico" ? "terapeutico" : "beneficios";
}

export function moduloDoProduto(produto: ProdutoCartao): ModuloCartao {
  return produto === "terapeutico" ? "cartao-terapeutico" : "cartao-beneficios";
}

/** Nome que aparece para o usuário. */
export function rotuloProduto(produto: ProdutoCartao): string {
  return produto === "terapeutico" ? "Cartão Terapêutico" : "Cartão Benefícios";
}

/** Prefixo das rotas do módulo. */
export function baseRotaProduto(produto: ProdutoCartao): string {
  return produto === "terapeutico" ? "/app/cartao-terapeutico" : "/app/cartao-beneficios";
}

/**
 * O contrato pertence a este produto?
 *
 * `idsDoProduto` são os convênios do produto já carregados pela tela. O filtro
 * é feito no cliente de propósito: nenhuma RPC (`buscar_contratos` e afins)
 * muda de assinatura por causa desta separação.
 */
export function contratoDoProduto(
  produto: ProdutoCartao,
  idsDoProduto: ReadonlySet<string>,
  convenioId: string | null | undefined,
): boolean {
  if (!convenioId) return produto === "beneficios";
  return idsDoProduto.has(convenioId);
}
