import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { consultarResumoDashboardOsZap } from "@/lib/atendimento/dashboard-oszap.functions";
import {
  periodoPadraoDashboard,
  type AgrupamentoDashboard,
} from "@/lib/atendimento/dashboard-oszap-periodos";
import { DashboardOsZapView } from "./DashboardOsZapView";

export function DashboardOsZap() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const [periodo, setPeriodo] = useState(periodoPadraoDashboard);
  const [agrupamento, setAgrupamento] = useState<AgrupamentoDashboard>("dia");
  const resumoFn = useServerFn(consultarResumoDashboardOsZap);
  const resumo = useQuery({
    queryKey: ["oszap-dashboard-historico", user?.id, clinicaId, periodo],
    queryFn: () => resumoFn({ data: { clinicaId: clinicaId!, periodo } }),
    enabled: !!clinicaId && !!user,
    retry: false,
    staleTime: Infinity,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  if (!clinicaId)
    return <p className="p-4 text-sm">Selecione uma clínica para abrir o dashboard.</p>;
  return (
    <DashboardOsZapView
      resumo={resumo.data}
      periodo={periodo}
      agrupamento={agrupamento}
      onAgrupamento={setAgrupamento}
      consultar={(novo) => {
        if (novo.de === periodo.de && novo.ate === periodo.ate) void resumo.refetch();
        else setPeriodo(novo);
      }}
      clinica={clinicaAtual?.clinica.nome ?? ""}
      atualizando={resumo.isFetching}
      erro={resumo.error?.message}
    />
  );
}
