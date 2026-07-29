// Helpers server-only do atendimento externo. Ficam fora do arquivo
// *.functions.ts por causa do split de server functions (o bundler apaga
// declarações irmãs do handler).

type Precos = {
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

export function valorDaTabela(p: Precos | null | undefined): number {
  if (!p) return 0;
  return primeiroValorValido(p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao);
}

/**
 * Preço do procedimento na tabela da clínica que está atendendo (a que
 * recebe a GR). É esse valor que vira base do repasse do médico quando o
 * operador não informa nada.
 */
export async function buscarValorProcedimento(
  supabase: { from: (t: string) => any },
  clinicaId: string,
  procedimento: string | null,
): Promise<number> {
  const nome = (procedimento ?? "").trim();
  if (!nome) return 0;
  const { data } = await supabase
    .from("procedimentos")
    .select("nome,valor_dinheiro,valor_dinheiro_pix,valor_padrao")
    .eq("clinica_id", clinicaId)
    .ilike("nome", nome)
    .limit(1)
    .maybeSingle();
  return valorDaTabela(data as Precos | null);
}
