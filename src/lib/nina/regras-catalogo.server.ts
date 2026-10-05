import { catalogoDoTurno } from "./catalogo-turno.server";
import { motivoRegraHumano } from "./regras-catalogo";
import { lerEstrutura } from "./catalogo-estrutura";

/** Valida ações pelo cadastro lido neste turno, inclusive em sessões antigas. */
export async function atendimentoExigeHumano(entrada: {
  clinicaId: string;
  medico?: string | null;
  procedimento?: string | null;
  referencias?: readonly string[];
  registrarMotivo?: (motivo: string) => void;
}): Promise<boolean> {
  const { clinicaId, medico, procedimento } = entrada;
  const referencias = (entrada.referencias ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const catalogo = await catalogoDoTurno(clinicaId);
  const restritos = catalogo.profissionais.filter(
    (p) => lerEstrutura(p.estrutura).encaminhamento_humano === true,
  );
  const registrar = async (
    registros: Array<{ id: string; nome: string; executantes?: unknown }>,
    profissional = false,
  ) => {
    const evidencia = registros.map((r) => ({
      nome: r.nome,
      profissional: profissional
        ? r.nome
        : Array.isArray(r.executantes)
          ? r.executantes.map((e) => (typeof e?.nome === "string" ? e.nome : "")).join(", ")
          : undefined,
    }));
    const motivo = motivoRegraHumano(evidencia);
    entrada.registrarMotivo?.(motivo);
    try {
      const { registrarEventoIATurno } = await import("./auditoria-ia.server");
      await registrarEventoIATurno("catalog.rule", {
        motivo,
        ferramenta_origem: "atendimentoExigeHumano",
        registros: registros.map((r) => ({
          id: r.id,
          nome: r.nome,
          campo: "estrutura.encaminhamento_humano",
          valor: true,
        })),
      });
    } catch {
      /* Auditoria não interfere na regra do catálogo. */
    }
  };
  const profissionais = restritos.filter(
    (p) =>
      referencias.includes(p.id) ||
      p.id === medico ||
      (Boolean(medico) && p.medico_id === medico) ||
      (Boolean(medico) &&
        p.nome.trim().toLocaleLowerCase("pt-BR") === medico?.trim().toLocaleLowerCase("pt-BR")),
  );
  if (profissionais.length) {
    await registrar(profissionais, true);
    return true;
  }
  if (medico && restritos.some((p) => p.medico_id)) {
    const { resolverMedicoAgenda } = await import("./vinculo-catalogo-agenda.server");
    const resolvido = await resolverMedicoAgenda(clinicaId, medico);
    const profissionaisResolvidos = resolvido.ok
      ? restritos.filter((p) => p.medico_id === resolvido.id)
      : [];
    if (profissionaisResolvidos.length) {
      await registrar(profissionaisResolvidos, true);
      return true;
    }
  }
  if (referencias.length) {
    const servicos = catalogo.servicos.filter(
      (s) => referencias.includes(s.id) && lerEstrutura(s.estrutura).encaminhamento_humano === true,
    );
    if (servicos.length) {
      await registrar(servicos);
      return true;
    }
  }
  if (procedimento?.trim()) {
    const alvo = procedimento.trim().toLocaleLowerCase("pt-BR");
    const servicos = catalogo.servicos.filter(
      (s) =>
        s.nome.toLocaleLowerCase("pt-BR") === alvo &&
        lerEstrutura(s.estrutura).encaminhamento_humano === true,
    );
    if (servicos.length) {
      await registrar(servicos);
      return true;
    }
  }
  return false;
}
