import { catalogoDoTurno } from "./catalogo-turno.server";
import { profissionalSfp } from "./regras-catalogo";

/** Valida ações pelo cadastro lido neste turno, inclusive em sessões antigas. */
export async function atendimentoExigeHumano(entrada: {
  clinicaId: string;
  medico?: string | null;
  procedimento?: string | null;
  referencias?: readonly string[];
}): Promise<boolean> {
  const { clinicaId, medico, procedimento } = entrada;
  const referencias = (entrada.referencias ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const catalogo = await catalogoDoTurno(clinicaId);
  const sfp = catalogo.profissionais.filter((p) => profissionalSfp(p.nome));
  if (
    sfp.some(
      (p) =>
        referencias.includes(p.id) ||
        p.id === medico ||
        (Boolean(medico) && p.medico_id === medico) ||
        (Boolean(medico) && profissionalSfp(medico)),
    )
  )
    return true;
  if (medico && sfp.some((p) => p.medico_id)) {
    const { resolverMedicoAgenda } = await import("./vinculo-catalogo-agenda.server");
    const resolvido = await resolverMedicoAgenda(clinicaId, medico);
    if (resolvido.ok && sfp.some((p) => p.medico_id === resolvido.id)) return true;
  }
  const exige = (executantes: unknown) =>
    Array.isArray(executantes) &&
    executantes.some((e) => e && typeof e === "object" && profissionalSfp(e.nome));
  if (referencias.length) {
    if (catalogo.servicos.filter((s) => referencias.includes(s.id)).some((s) => exige(s.executantes))) return true;
  }
  if (procedimento?.trim()) {
    const alvo = procedimento.trim().toLocaleLowerCase("pt-BR");
    if (catalogo.servicos.filter((s) => s.nome.toLocaleLowerCase("pt-BR") === alvo).some((s) => exige(s.executantes)))
      return true;
  }
  return false;
}
