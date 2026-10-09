import { acrescentarEspecialidade, especialidadeDoProcedimento } from "./nfse-descricao";

/**
 * Acrescenta a especialidade à descrição da NFS-e quando ela é conhecida pelo
 * agendamento. Fonte: `agendamentos.especialidade_id` ou o sufixo entre
 * parênteses do procedimento, desde que seja uma especialidade cadastrada.
 * Vários agendamentos com especialidades diferentes: não mexe. Qualquer
 * falha de leitura: devolve a descrição original (não inventa).
 */
export async function descricaoComEspecialidade(
  admin: any,
  descricao: string,
  agendamentoIds: (string | null | undefined)[],
): Promise<string> {
  const ids = [...new Set(agendamentoIds.filter(Boolean))] as string[];
  if (!ids.length) return descricao;
  try {
    const [{ data: ags }, { data: esps }] = await Promise.all([
      admin.from("agendamentos").select("procedimento, especialidade_id").in("id", ids),
      admin.from("especialidades").select("id, nome"),
    ]);
    const lista = (esps ?? []) as { id: string; nome: string }[];
    const nomes = lista.map((e) => e.nome);
    const achadas = new Set<string | null>(
      ((ags ?? []) as { procedimento: string | null; especialidade_id: string | null }[]).map(
        (a) =>
          (a.especialidade_id
            ? lista
                .find((e) => e.id === a.especialidade_id)
                ?.nome?.toUpperCase()
                .trim()
            : null) ?? especialidadeDoProcedimento(a.procedimento, nomes),
      ),
    );
    if (achadas.size !== 1) return descricao;
    const procs = ((ags ?? []) as { procedimento: string | null }[]).map((a) => a.procedimento);
    return acrescentarEspecialidade(descricao, [...achadas][0] ?? null, procs);
  } catch {
    return descricao;
  }
}
