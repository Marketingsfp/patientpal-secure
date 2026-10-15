/**
 * Flag por clínica da ligação de demonstração. Sem linha em
 * `clinica_feature_flags` = desligada: a aba some e o servidor recusa.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FLAG_NINA_LIGACAO } from "./config";

export async function flagLigacaoAtiva(clinicaId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("clinica_feature_flags")
      .select("ativo")
      .eq("clinica_id", clinicaId)
      .eq("flag_key", FLAG_NINA_LIGACAO)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as { ativo?: boolean }).ativo);
  } catch {
    return false;
  }
}
