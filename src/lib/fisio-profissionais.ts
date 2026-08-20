import { supabase } from "@/integrations/supabase/client";

export interface ProfissionalFisio {
  id: string;
  nome: string;
}

/**
 * Profissionais que podem aparecer nos selects do módulo de Fisioterapia.
 *
 * A lista é montada a partir do cadastro de especialidades, não de uma lista
 * fixa de nomes: basta o profissional ter FISIOTERAPIA como especialidade
 * principal (`medicos.especialidade_id`) ou entre as demais
 * (`medico_especialidades`) que ele passa a aparecer aqui sozinho.
 *
 * Se a especialidade não existir no cadastro, devolvemos todos os
 * profissionais ativos — um select vazio deixaria a tela sem saída, e o
 * comportamento antigo é o mal menor.
 */
export async function buscarProfissionaisFisio(clinicaId: string): Promise<ProfissionalFisio[]> {
  const { data: esp } = await supabase
    .from("especialidades")
    .select("id")
    .ilike("nome", "%fisioterap%")
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (!esp?.id) {
    const { data } = await supabase
      .from("medicos")
      .select("id, nome")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome");
    return data ?? [];
  }

  const { data: vinculos } = await supabase
    .from("medico_especialidades")
    .select("medico_id")
    .eq("especialidade_id", esp.id);

  const ids = Array.from(new Set((vinculos ?? []).map((v) => v.medico_id)));

  // Duas consultas em vez de um `or` com join: a especialidade principal fica
  // na própria linha do médico e as demais numa tabela à parte, então o filtro
  // combinado sairia mais frágil do que juntar os dois resultados aqui.
  const [{ data: principais }, { data: secundarios }] = await Promise.all([
    supabase
      .from("medicos")
      .select("id, nome")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .eq("especialidade_id", esp.id)
      .order("nome"),
    ids.length
      ? supabase
          .from("medicos")
          .select("id, nome")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .in("id", ids)
          .order("nome")
      : Promise.resolve({ data: [] as ProfissionalFisio[] }),
  ]);

  const porId = new Map<string, ProfissionalFisio>();
  for (const p of [...(principais ?? []), ...(secundarios ?? [])]) {
    porId.set(p.id, p);
  }
  return Array.from(porId.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
