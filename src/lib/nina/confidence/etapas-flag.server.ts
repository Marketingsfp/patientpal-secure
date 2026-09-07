/**
 * FASE 8 — leitura da etapa de ativação por clínica (server-only).
 *
 * Padrão SEGURO: sem configuração, etapa A (o motor só observa).
 * A clínica avança gravando `nina_confidence_etapa` com `ativo = true` e
 * `config = { "etapa": "B" | "C" | "D" }`.
 * A flag antiga `nina_confidence_enforce` continua valendo como etapa C.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { etapaDeFlag, type EtapaAtivacao } from "./etapas";
import type { ModoConfianca } from "./shadow";

export const FLAG_CONFIDENCE_ETAPA = "nina_confidence_etapa";
export const FLAG_CONFIDENCE_ENFORCE = "nina_confidence_enforce";

/** Etapa A é observação: equivale ao modo shadow gravado na auditoria. */
export function modoDaEtapa(etapa: EtapaAtivacao): ModoConfianca {
  return etapa === "A" ? "shadow" : "enforce";
}

export async function etapaConfianca(clinicaId: string): Promise<EtapaAtivacao> {
  try {
    const { data, error } = await supabaseAdmin
      .from("clinica_feature_flags")
      .select("flag_key, ativo, config")
      .eq("clinica_id", clinicaId)
      .in("flag_key", [FLAG_CONFIDENCE_ETAPA, FLAG_CONFIDENCE_ENFORCE]);
    if (error || !data) return "A";

    const linhaEtapa = data.find((l) => l.flag_key === FLAG_CONFIDENCE_ETAPA);
    const enforceLegado =
      data.find((l) => l.flag_key === FLAG_CONFIDENCE_ENFORCE)?.ativo === true;

    const cfg = (linhaEtapa?.config ?? null) as { etapa?: unknown } | null;
    const valor = linhaEtapa?.ativo === true ? cfg?.etapa : undefined;
    return etapaDeFlag(valor, { enforceLegado });
  } catch {
    return "A";
  }
}
