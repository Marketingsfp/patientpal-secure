/**
 * Regra de contagem de atendimentos (aprovada 2026-07-07, revisada para
 * usar `procedimentos.tipo_procedimento` como fonte da verdade):
 *
 * - **Laboratório** (categoria `laboratorio` do procedimento): N exames do
 *   mesmo paciente no mesmo dia contam como **1 atendimento**.
 * - **Demais categorias** (imagem, consulta, procedimento, cirurgia):
 *   **1 linha = 1 atendimento**.
 *
 * O helper aceita um resolver por texto de procedimento (recomendado) e,
 * como fallback compatível com o código anterior, a heurística "médico de
 * laboratório" para agendamentos sem procedimento cadastrado.
 */

import type { CategoriaResolver } from "@/lib/procedimento/categoria";

export type AgendamentoContavel = {
  id: string;
  medico_id: string | null;
  paciente_id: string | null;
  inicio: string | null;
  /** Texto livre do agendamento — pode conter "A + B" para laboratório. */
  procedimento?: string | null;
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
  resolver?: CategoriaResolver | null,
): number {
  let naoLab = 0;
  const grupos = new Set<string>();
  for (const a of ags) {
    // 1) Fonte primária: categoria do procedimento (via resolver).
    let isLab = false;
    if (resolver && a.procedimento) {
      isLab = resolver.categoriaDoTexto(a.procedimento) === "laboratorio";
    }
    // 2) Fallback: procedimento vazio/não cadastrado — usa heurística por médico.
    if (!isLab && (!resolver || !a.procedimento)) {
      isLab = !!a.medico_id && labMedicoIds.has(a.medico_id);
    }
    if (!isLab) {
      naoLab++;
      continue;
    }
    const dia = (a.inicio ?? "").slice(0, 10);
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