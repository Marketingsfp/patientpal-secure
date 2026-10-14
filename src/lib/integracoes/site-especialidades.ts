/**
 * Regras puras de "o que o site oferece", por clínica.
 * Ausência de linha (em especialidade_unidade ou site_agendamento_especialidade)
 * = especialidade liberada.
 */

/** Junta os ids desligados das duas tabelas (teto da unidade + interruptor do site). */
export function idsDesligados(
  ...listas: Array<Array<{ especialidade_id: string; ativo: boolean | null }> | null | undefined>
): Set<string> {
  const s = new Set<string>();
  for (const l of listas)
    for (const r of l ?? []) if (r.ativo === false) s.add(r.especialidade_id);
  return s;
}

/**
 * Médico aparece no site se não tiver nenhuma especialidade (como antes) ou
 * se ao menos uma das suas especialidades (principal + N:N) estiver liberada.
 */
export function medicoLiberado(
  especialidades: Array<string | null | undefined>,
  desligadas: Set<string>,
): boolean {
  const ids = [...new Set(especialidades.filter((x): x is string => !!x))];
  if (ids.length === 0) return true;
  return ids.some((id) => !desligadas.has(id));
}
