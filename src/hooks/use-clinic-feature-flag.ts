import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "./use-clinica";

/**
 * Flags ligadas por CÓDIGO para a POLICLINICA MENINO JESUS — sem depender de
 * registro em `clinica_feature_flags`.
 *
 * Por que por código e não só pelo banco: a RLS de `clinica_feature_flags` só
 * deixa `is_member` ler as linhas da PRÓPRIA clínica, e resolver a flag no
 * cliente antes da resposta do banco evita o flash do comportamento antigo.
 *
 * Inclui flags que LIGAM UX (`ux_melhorias`, `menu_hover_scale`) e flags que
 * DESLIGAM recursos (`turbo_mode_agenda_disabled`).
 *
 * NÃO incluídas: `permissoes_financeiro_granular`, `novo_layout_agenda`.
 */
const FLAGS_PADRAO_MENINO_JESUS = new Set<string>([
  "ux_melhorias",
  "menu_hover_scale",
  "turbo_mode_agenda_disabled",
]);

/** Identificação por nome, mesmo padrão usado no app-shell/agenda. */
function ehMeninoJesus(nome: string | null | undefined): boolean {
  const n = (nome ?? "").toLowerCase();
  return n.includes("menino jesus");
}

/**
 * Feature flag por clínica (tabela `clinica_feature_flags`).
 *
 * Uso:
 *   const { enabled, loading } = useClinicFeatureFlag("novo_layout_agenda");
 *
 * - Escopo: lê a flag da `clinicaAtual` do contexto (nunca cruza clínicas).
 * - Default: OFF quando não existe registro para a clínica.
 * - Escrita: apenas admin/gestor pela RLS. Use `setClinicFeatureFlag` abaixo.
 * - Override de código: flags em `FLAGS_PADRAO_MENINO_JESUS` ficam ligadas na
 *   Menino Jesus, mesmo sem registro no banco.
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

  // Override por código (não depende do banco; resolve o "loading" na hora pra
  // evitar flash do comportamento antigo antes da resposta do banco).
  const overrideHerdado =
    FLAGS_PADRAO_MENINO_JESUS.has(flagKey) && ehMeninoJesus(clinicaAtual?.clinica.nome);
  return {
    enabled: enabled || overrideHerdado,
    loading: overrideHerdado ? false : loading,
    clinicaId,
  };
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