// Helper server-only do atendimento externo. Fica fora do *.functions.ts por
// causa do split de server functions (o bundler apaga declarações irmãs).
import { valorDaTabela, type PrecosProcedimento } from "./atendimento-externo-preco";

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
  return valorDaTabela(data as PrecosProcedimento | null);
}
