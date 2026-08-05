import { useClinicFeatureFlag } from "./use-clinic-feature-flag";

/**
 * Retorna true quando a clínica atual desabilitou o módulo "Atendimento
 * Múltiplo" (flag `atendimento_multiplo_disabled`). Usado para ocultar
 * o item de menu e redirecionar a rota nas clínicas onde a feature não
 * é ofertada (ex.: POLICLINICA SAO FRANCISCO DE PAULA).
 */
export function useAtendimentoMultiploDisabled(): { disabled: boolean; loading: boolean } {
  const { enabled, loading } = useClinicFeatureFlag("atendimento_multiplo_disabled");
  return { disabled: enabled, loading };
}