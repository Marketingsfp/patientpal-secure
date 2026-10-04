import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FLAG_FONTE_CONSULTA, selecaoFonte } from "./fonte-consulta";

/** Sem cache entre turnos: uma troca manual é percebida na próxima resposta. */
export async function lerSelecaoFonte(clinicaId: string) {
  const { data, error } = await supabaseAdmin.from("clinica_feature_flags")
    .select("ativo, config, updated_at").eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_FONTE_CONSULTA).maybeSingle();
  if (error) throw new Error("Não foi possível conferir a fonte de consulta da Maria.");
  return selecaoFonte(data);
}
