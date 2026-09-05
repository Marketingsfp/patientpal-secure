/**
 * Flag por clínica da OFERTA COMPLETA da Nina (valor + médicos + datas +
 * horários + unidade na mesma resposta).
 *
 * Sem linha em `clinica_feature_flags` = desligado (comportamento anterior
 * intacto).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_OFERTA_COMPLETA = "nina_oferta_completa_enabled";

export async function flagOfertaCompletaAtiva(clinicaId: string | null): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_OFERTA_COMPLETA)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { ativo?: boolean }).ativo);
}
