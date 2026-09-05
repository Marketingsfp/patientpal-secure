/**
 * Flag por clínica da FASE 2 do novo fluxo de atendimento da Nina
 * (respostas factuais fundamentadas na planilha da Base de Conhecimentos).
 *
 * Sem linha em `clinica_feature_flags` = desligado (comportamento antigo
 * intacto).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_FLUXO_FASE2 = "nina_fluxo_fase2_enabled";

export async function flagFluxoFase2Ativa(clinicaId: string | null): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_FLUXO_FASE2)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { ativo?: boolean }).ativo);
}
