import { catalogoDoTurno } from "./catalogo-turno.server";
import { lerEstrutura } from "./catalogo-estrutura";

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
  const restritos = catalogo.profissionais.filter((p) => lerEstrutura(p.estrutura).encaminhamento_humano === true);
  if (
    restritos.some(
      (p) =>
        referencias.includes(p.id) ||
        p.id === medico ||
        (Boolean(medico) && p.medico_id === medico) ||
        (Boolean(medico) && p.nome.trim().toLocaleLowerCase("pt-BR") === medico?.trim().toLocaleLowerCase("pt-BR")),
    )
  )
    return true;
  if (medico && restritos.some((p) => p.medico_id)) {
    const { resolverMedicoAgenda } = await import("./vinculo-catalogo-agenda.server");
    const resolvido = await resolverMedicoAgenda(clinicaId, medico);
    if (resolvido.ok && restritos.some((p) => p.medico_id === resolvido.id)) return true;
  }
  if (referencias.length) {
    if (catalogo.servicos.filter((s) => referencias.includes(s.id)).some((s) => lerEstrutura(s.estrutura).encaminhamento_humano === true)) return true;
  }
  if (procedimento?.trim()) {
    const alvo = procedimento.trim().toLocaleLowerCase("pt-BR");
    if (catalogo.servicos.filter((s) => s.nome.toLocaleLowerCase("pt-BR") === alvo).some((s) => lerEstrutura(s.estrutura).encaminhamento_humano === true))
      return true;
  }
  return false;
}
