import { useClinicFeatureFlag } from "./use-clinic-feature-flag";

/**
 * Retorna true quando a clínica atual desabilitou a Agenda Express
 * (flag `agenda_express_disabled`).
 */
export function useAgendaExpressDisabled(): boolean {
  const { enabled } = useClinicFeatureFlag("agenda_express_disabled");
  return enabled;
}