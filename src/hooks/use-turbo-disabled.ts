import { useEffect } from "react";
import { useClinicFeatureFlag } from "./use-clinic-feature-flag";
import { setTurboMode } from "@/lib/turbo-mode";

/**
 * Retorna true quando a clínica atual desabilitou o Modo Turbo da Agenda
 * (flag `turbo_mode_agenda_disabled`). Força o modo local a OFF para que
 * atalhos F2/F3/... não disparem mesmo se o localStorage tinha "1".
 */
export function useTurboDisabled(): boolean {
  const { enabled: disabled, loading } = useClinicFeatureFlag("turbo_mode_agenda_disabled");
  useEffect(() => {
    if (!loading && disabled) setTurboMode(false);
  }, [disabled, loading]);
  return disabled;
}