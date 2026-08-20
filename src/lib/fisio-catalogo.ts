import { supabase } from "@/integrations/supabase/client";

export interface ProfissionalFisio {
  id: string;
  nome: string;
}

export interface ProcedimentoFisio {
  id: string;
  nome: string;
  valor_padrao: number;
}

/**
 * Como reconhecemos a Fisioterapia no cadastro. É um trecho do nome, e não um
 * id fixo, para o filtro continuar funcionando se a especialidade for
 * recriada — e o mesmo trecho serve para o grupo dos procedimentos.
 */
const PADRAO_FISIO = "%fisioterap%";

async function especialidadeFisioId(): Promise<string | null> {
  const { data } = await supabase
    .from("especialidades")
    .select("id")
    .ilike("nome", PADRAO_FISIO)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
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
  const espId = await especialidadeFisioId();

  if (!espId) {
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
    .eq("especialidade_id", espId);

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
      .eq("especialidade_id", espId)
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

/**
 * Procedimentos que podem ser vinculados a um pacote de Fisioterapia.
 *
 * Vale por dois caminhos do cadastro, porque hoje a clínica usa um e amanhã
 * pode usar o outro: o vínculo explícito procedimento × especialidade
 * (`procedimento_especialidades`) e o grupo do próprio procedimento. Cadastrar
 * um procedimento novo em qualquer um dos dois já o traz para cá.
 *
 * Sem nenhum dos dois caminhos disponível, devolvemos os procedimentos ativos
 * como antes — melhor a lista longa do que um select vazio.
 */
export async function buscarProcedimentosFisio(clinicaId: string): Promise<ProcedimentoFisio[]> {
  const espId = await especialidadeFisioId();

  const [{ data: vinculos }, { data: porGrupo }] = await Promise.all([
    espId
      ? supabase
          .from("procedimento_especialidades")
          .select("procedimento_id")
          .eq("clinica_id", clinicaId)
          .eq("especialidade_id", espId)
      : Promise.resolve({ data: [] as { procedimento_id: string }[] }),
    supabase
      .from("procedimentos")
      .select("id, nome, valor_padrao")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .ilike("grupo", PADRAO_FISIO)
      .order("nome"),
  ]);

  const ids = Array.from(new Set((vinculos ?? []).map((v) => v.procedimento_id)));
  const { data: porVinculo } = ids.length
    ? await supabase
        .from("procedimentos")
        .select("id, nome, valor_padrao")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .in("id", ids)
        .order("nome")
    : { data: [] as ProcedimentoFisio[] };

  const porId = new Map<string, ProcedimentoFisio>();
  for (const p of [...(porGrupo ?? []), ...(porVinculo ?? [])]) {
    porId.set(p.id, p);
  }

  if (porId.size === 0) {
    const { data } = await supabase
      .from("procedimentos")
      .select("id, nome, valor_padrao")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome");
    return data ?? [];
  }

  return Array.from(porId.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
