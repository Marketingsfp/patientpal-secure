/**
 * Flag por clínica: pedir nome completo e data de nascimento antes de
 * transferir para a equipe (regra de 12/10/2026, `dados-transferencia.ts`).
 *
 * Sem linha em `clinica_feature_flags` = desligado (transfere na hora, como antes).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_DADOS_TRANSFERENCIA = "nina_dados_transferencia";

export async function flagDadosTransferenciaAtiva(clinicaId: string | null): Promise<boolean> {
  if (!clinicaId) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from("clinica_feature_flags")
      .select("ativo")
      .eq("clinica_id", clinicaId)
      .eq("flag_key", FLAG_NINA_DADOS_TRANSFERENCIA)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as { ativo?: boolean }).ativo);
  } catch {
    return false;
  }
}
