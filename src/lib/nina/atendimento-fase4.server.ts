/**
 * Flag por clínica da FASE 4 do novo fluxo de atendimento da Nina
 * (disponibilidade real, escolha de horário e confirmação final).
 *
 * Sem linha em `clinica_feature_flags` = desligado.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_FLUXO_FASE4 = "nina_fluxo_fase4_enabled";

export async function flagFluxoFase4Ativa(clinicaId: string | null): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_FLUXO_FASE4)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { ativo?: boolean }).ativo);
}
