import { useClinicFeatureFlag } from "./use-clinic-feature-flag";

/** Chave da feature flag por clínica que desliga a assistente Nina. */
export const FLAG_NINA_DESATIVADA = "nina_desativada";

/**
 * Retorna true quando a clínica atual desligou a assistente Nina
 * (flag `nina_desativada`). Enquanto carrega, tratamos como ATIVA para não
 * piscar o botão sumindo/aparecendo.
 */
export function useNinaDesativada(): { desativada: boolean; loading: boolean } {
  const { enabled, loading } = useClinicFeatureFlag(FLAG_NINA_DESATIVADA);
  return { desativada: !loading && enabled, loading };
}
