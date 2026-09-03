/**
 * Cadastro de categorias financeiras (`fin_categorias`) — o mesmo que a tela
 * Financeiro → Categorias mantém.
 *
 * Existe como arquivo próprio porque três lugares precisam da MESMA lista: o
 * seletor de Categoria da tela de Relatórios (que precisa das opções antes de
 * qualquer "Buscar"), a Movimentação Financeira (que resolve `categoria_id` →
 * nome em cada lançamento) e o Rateio da Receita (idem). Duplicar a consulta
 * abriria a porta para as três divergirem — por exemplo, uma trazendo as
 * categorias de outra clínica.
 *
 * A lista é curta (algumas dezenas de linhas) e é carregada uma vez por
 * clínica, não uma por lançamento.
 */
import { supabase } from "@/integrations/supabase/client";

/** Uma categoria do cadastro, no mínimo que os relatórios precisam saber. */
export type CategoriaFinanceira = {
  id: string;
  nome: string;
  /** `receita` ou `despesa` — é o que separa as duas listas do cadastro. */
  tipo: string;
};

/** Todas as categorias cadastradas na clínica, em ordem alfabética. */
export async function carregarCategorias(clinicaId: string): Promise<CategoriaFinanceira[]> {
  const { data, error } = await supabase
    .from("fin_categorias")
    .select("id, nome, tipo")
    .eq("clinica_id", clinicaId)
    .order("nome");
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; nome: string | null; tipo: string | null }>).map(
    (c) => ({ id: c.id, nome: c.nome ?? "", tipo: String(c.tipo ?? "") }),
  );
}

/** Índice id → nome, para carimbar o nome da categoria em cada linha. */
export function mapaDeCategorias(categorias: CategoriaFinanceira[]): Map<string, string> {
  return new Map(categorias.map((c) => [c.id, c.nome]));
}
