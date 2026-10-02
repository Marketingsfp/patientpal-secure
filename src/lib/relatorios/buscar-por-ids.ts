/**
 * Busca linhas de uma tabela pelos ids, em lotes — para os relatórios.
 *
 * Por que existe
 * --------------
 * Os relatórios (Relatórios → Baixar planilhas, Dashboard e Cubo BI) trazem
 * milhares de linhas e depois precisam do nome do paciente, do médico etc.
 * Pedir `.in("id", ids)` com 15 mil ids de uma vez estoura o tamanho da URL ou
 * volta cortado em 1.000 linhas, e o relatório saía com "—" no lugar do nome.
 * Também não dá para pedir o nome junto (`pacientes(nome)`) em várias tabelas:
 * prontuários, orçamentos, documentos, triagens e outras não têm o vínculo
 * cadastrado no banco, e o PostgREST recusa a consulta inteira.
 *
 * Aqui os ids vão em lotes pequenos (cabem na URL e nunca passam de 1.000
 * linhas), pedidos em ondas para não disparar dezenas de requisições juntas.
 * Qualquer lote que falhe derruba a busca: nome faltando em silêncio é pior do
 * que um erro na tela.
 */
import { supabase } from "@/integrations/supabase/client";

const TAMANHO_LOTE = 150;
const LOTES_POR_ONDA = 6;

/** `colunas` tem que incluir `id`. */
export async function buscarPorIds<T extends { id: string }>(
  tabela: string,
  colunas: string,
  ids: Array<string | null | undefined>,
): Promise<Map<string, T>> {
  const unicos = Array.from(new Set(ids.filter((x): x is string => !!x)));
  const mapa = new Map<string, T>();
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += TAMANHO_LOTE) {
    lotes.push(unicos.slice(i, i + TAMANHO_LOTE));
  }
  for (let i = 0; i < lotes.length; i += LOTES_POR_ONDA) {
    const respostas = await Promise.all(
      lotes.slice(i, i + LOTES_POR_ONDA).map(async (lote) => {
        const { data, error } = await (supabase as any).from(tabela).select(colunas).in("id", lote);
        if (error) throw error;
        return (data ?? []) as T[];
      }),
    );
    for (const linhas of respostas) for (const l of linhas) mapa.set(l.id, l);
  }
  return mapa;
}

/** Atalho para o caso mais comum: id → nome. */
export async function nomesPorId(
  tabela: string,
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const linhas = await buscarPorIds<{ id: string; nome: string | null }>(tabela, "id, nome", ids);
  const mapa = new Map<string, string>();
  for (const [id, l] of linhas) if (l.nome) mapa.set(id, l.nome);
  return mapa;
}
