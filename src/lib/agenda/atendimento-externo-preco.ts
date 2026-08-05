// Helpers client-safe de preço do atendimento externo.
export type PrecosProcedimento = {
  valor_dinheiro?: number | null;
  valor_dinheiro_pix?: number | null;
  valor_padrao?: number | null;
};

export function primeiroValorValido(...vals: Array<number | null | undefined>): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Preço do serviço na tabela da clínica que atende (recebe a GR). */
export function valorDaTabela(p: PrecosProcedimento | null | undefined): number {
  if (!p) return 0;
  return primeiroValorValido(p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao);
}
