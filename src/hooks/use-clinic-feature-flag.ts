import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "./use-clinica";

/**
 * Feature flag por clínica (tabela `clinica_feature_flags`).
 *
 * Uso:
 *   const { enabled, loading } = useClinicFeatureFlag("novo_layout_agenda");
 *
 * - Escopo: lê a flag da `clinicaAtual` do contexto (nunca cruza clínicas).
 * - Default: OFF quando não existe registro para a clínica.
 * - Escrita: apenas admin/gestor pela RLS. Use `setClinicFeatureFlag` abaixo.
 */
export function useClinicFeatureFlag(flagKey: string) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!clinicaId) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("clinica_feature_flags")
        .select("ativo")
        .eq("clinica_id", clinicaId)
        .eq("flag_key", flagKey)
        .maybeSingle();
      if (!alive) return;
      setEnabled(Boolean(data?.ativo));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [clinicaId, flagKey]);

  return { enabled, loading, clinicaId };
}

/**
 * Ativa/desativa uma flag para uma clínica específica. Requer papel
 * admin ou gestor (validado por RLS no banco).
 */
export async function setClinicFeatureFlag(
  clinicaId: string,
  flagKey: string,
  ativo: boolean,
  descricao?: string,
) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id ?? null;
  const { error } = await supabase
    .from("clinica_feature_flags")
    .upsert(
      {
        clinica_id: clinicaId,
        flag_key: flagKey,
        ativo,
        descricao: descricao ?? null,
        updated_by: uid,
        created_by: uid,
      },
      { onConflict: "clinica_id,flag_key" },
    );
  if (error) throw error;
}