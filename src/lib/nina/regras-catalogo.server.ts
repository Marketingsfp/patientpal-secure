import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { profissionalSfp } from "./regras-catalogo";

/** Revalida a publicação antes de ações, inclusive em sessões iniciadas antes da regra. */
export async function atendimentoExigeHumano(entrada: {
  clinicaId: string;
  medico?: string | null;
  procedimento?: string | null;
  referencias?: readonly string[];
}): Promise<boolean> {
  const { clinicaId, medico, procedimento } = entrada;
  const referencias = (entrada.referencias ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const profissionais = await supabaseAdmin
    .from("nina_cat_profissionais")
    .select("id, nome, medico_id")
    .eq("clinica_id", clinicaId)
    .eq("status", "PUBLICADO")
    .ilike("nome", "%sfp%");
  if (profissionais.error) throw new Error(profissionais.error.message);
  const sfp = (profissionais.data ?? []).filter((p) => profissionalSfp(p.nome));
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
    const r = await supabaseAdmin
      .from("nina_cat_servicos")
      .select("id, executantes")
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .in("id", referencias);
    if (r.error) throw new Error(r.error.message);
    if ((r.data ?? []).some((s) => exige(s.executantes))) return true;
  }
  if (procedimento?.trim()) {
    const r = await supabaseAdmin
      .from("nina_cat_servicos")
      .select("id, executantes")
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .ilike("nome", procedimento.trim().replace(/[\\%_]/g, "\\$&"));
    if (r.error) throw new Error(r.error.message);
    if ((r.data ?? []).some((s) => exige(s.executantes))) return true;
  }
  return false;
}
