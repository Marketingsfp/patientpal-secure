import { supabase } from "@/integrations/supabase/client";
import { makeCache } from "./single-flight";

/**
 * Todas as feature flags da clínica em UMA leitura.
 *
 * Antes, `useClinicFeatureFlag("x")` fazia um SELECT por flag — a Agenda
 * chegava a 11 requisições em `clinica_feature_flags` na abertura. Agora
 * lemos o conjunto inteiro da clínica uma vez e cada hook consulta o mapa.
 */
const cache = makeCache<Record<string, boolean>>(60_000);

export function getClinicFlags(clinicaId: string): Promise<Record<string, boolean>> {
  return cache.get(clinicaId, async () => {
    const { data } = await supabase
      .from("clinica_feature_flags")
      .select("flag_key,ativo")
      .eq("clinica_id", clinicaId);
    const map: Record<string, boolean> = {};
    for (const row of (data ?? []) as { flag_key: string; ativo: boolean | null }[]) {
      map[row.flag_key] = Boolean(row.ativo);
    }
    return map;
  });
}

export function peekClinicFlags(clinicaId: string): Record<string, boolean> | null {
  return cache.peek(clinicaId);
}

export function invalidateClinicFlags(clinicaId?: string): void {
  cache.invalidate(clinicaId);
}
