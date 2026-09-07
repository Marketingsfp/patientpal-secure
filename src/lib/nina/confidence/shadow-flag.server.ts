/**
 * FASE 7 — leitura do modo do Confidence Engine por clínica (server-only).
 *
 * Padrão SEGURO: sem a flag gravada como `ativo = true`, o motor roda em
 * SHADOW (registra, não bloqueia). Só quando a clínica ligar explicitamente
 * `nina_confidence_enforce` a decisão passa a valer no atendimento.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { modoDeFlag, type ModoConfianca } from "./shadow";

export const FLAG_CONFIDENCE_ENFORCE = "nina_confidence_enforce";

export async function modoConfianca(clinicaId: string): Promise<ModoConfianca> {
  try {
    const { data, error } = await supabaseAdmin
      .from("clinica_feature_flags")
      .select("ativo")
      .eq("clinica_id", clinicaId)
      .eq("flag_key", FLAG_CONFIDENCE_ENFORCE)
      .maybeSingle();
    if (error) return "shadow";
    return modoDeFlag(data?.ativo);
  } catch {
    return "shadow";
  }
}
