/**
 * Flag por clínica da FASE 1 do novo fluxo de atendimento da Nina.
 *
 * Sem linha em `clinica_feature_flags` = desligado (comportamento antigo
 * intacto). Ligada hoje apenas na Policlínica Menino Jesus, por decisão do
 * time.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_FLUXO_FASE1 = "nina_fluxo_fase1_enabled";

export async function flagFluxoFase1Ativa(clinicaId: string | null): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_FLUXO_FASE1)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { ativo?: boolean }).ativo);
}
