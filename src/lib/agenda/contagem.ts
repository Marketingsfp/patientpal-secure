/**
 * Regra de contagem de atendimentos (aprovada 2026-07-07):
 *
 * - **Laboratório** (especialidade cujo nome contém "laborat"): N exames do
 *   mesmo paciente no mesmo dia contam como **1 atendimento**.
 * - **Demais especialidades** (imagem, consulta, procedimento): **1 linha =
 *   1 atendimento**.
 *
 * O helper recebe uma lista de agendamentos e os mapas auxiliares que
 * permitem descobrir se o médico é de laboratório.
 */

export type AgendamentoContavel = {
  id: string;
  medico_id: string | null;
  paciente_id: string | null;
  inicio: string | null;
};

export type EspecialidadeMin = { id: string; nome: string | null };
export type MedicoEspecialidadeMin = { medico_id: string; especialidade_id: string };

/** Retorna o conjunto de `medico_id` cuja especialidade é laboratório. */
export function laboratorioMedicoIdsFrom(
  especialidades: EspecialidadeMin[],
  medicoEspecialidades: MedicoEspecialidadeMin[],
): Set<string> {
  const labEspIds = new Set(
    especialidades
      .filter((e) => (e.nome ?? "").toLowerCase().includes("laborat"))
      .map((e) => e.id),
  );
  const set = new Set<string>();
  for (const me of medicoEspecialidades) {
    if (labEspIds.has(me.especialidade_id)) set.add(me.medico_id);
  }
  return set;
}

/**
 * Conta atendimentos aplicando a regra de laboratório.
 * @param ags - agendamentos a contar (já filtrados por status se necessário).
 * @param labMedicoIds - retorno de `laboratorioMedicoIdsFrom`.
 */
export function contarAtendimentos(
  ags: AgendamentoContavel[],
  labMedicoIds: Set<string>,
): number {
  let naoLab = 0;
  const grupos = new Set<string>();
  for (const a of ags) {
    const isLab = !!a.medico_id && labMedicoIds.has(a.medico_id);
    if (!isLab) {
      naoLab++;
      continue;
    }
    const dia = (a.inicio ?? "").slice(0, 10);
    // 1 grupo = 1 paciente + 1 dia (sem paciente_id, cai para o próprio id)
    grupos.add(`${a.paciente_id ?? a.id}|${dia}`);
  }
  return naoLab + grupos.size;
}

/** Retorna `true` quando o médico é de laboratório. Útil para UI. */
export function isMedicoLaboratorio(
  medicoId: string | null | undefined,
  labMedicoIds: Set<string>,
): boolean {
  return !!medicoId && labMedicoIds.has(medicoId);
}