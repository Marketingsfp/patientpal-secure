/**
 * Verificação server-side do "botão" que desliga a Nina por clínica
 * (feature flag `nina_desativada`).
 *
 * Usado no webhook do WhatsApp e no chat da Nina, para que desligar não
 * dependa só de esconder botão na tela.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FLAG_NINA_DESATIVADA = "nina_desativada";

export async function ninaDesativadaNaClinica(clinicaId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("clinica_feature_flags")
    .select("ativo")
    .eq("clinica_id", clinicaId)
    .eq("flag_key", FLAG_NINA_DESATIVADA)
    .maybeSingle();
  if (error) return false; // falha de leitura não deve derrubar o fluxo
  return Boolean(data?.ativo);
}
