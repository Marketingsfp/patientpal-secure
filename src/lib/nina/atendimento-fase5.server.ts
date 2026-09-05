/**
 * Flag por clínica da FASE 5 do novo fluxo de atendimento da Nina
 * (execução real do agendamento e encerramento da conversa).
 *
 * Sem linha em `clinica_feature_flags` = desligado.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_FLUXO_FASE5 = "nina_fluxo_fase5_enabled";

export async function flagFluxoFase5Ativa(clinicaId: string | null): Promise<boolean> {
  if (!clinicaId) return false;
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_FLUXO_FASE5)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { ativo?: boolean }).ativo);
}
