import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useRelogioPausa } from "@/hooks/use-relogio-pausa";
import {
  consultarResumoDashboardOsZap,
  consultarFilaHumanaDashboardOsZap,
} from "@/lib/atendimento/dashboard-oszap.functions";
import { DashboardOsZapView } from "./DashboardOsZapView";

/** Apenas atendimento humano; nenhuma consulta de motor, prompt, modelo ou teste. */
export function DashboardOsZap() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const [dias, setDias] = useState<7 | 30 | 90>(7);
  const navegar = useNavigate();
  const agora = useRelogioPausa();
  const resumoFn = useServerFn(consultarResumoDashboardOsZap);
  const filaFn = useServerFn(consultarFilaHumanaDashboardOsZap);
  const chave = ["oszap-dashboard-humano", user?.id, clinicaId];
  const resumo = useQuery({
    queryKey: [...chave, "periodo", dias],
    queryFn: () => resumoFn({ data: { clinicaId: clinicaId!, dias } }),
    enabled: !!clinicaId && !!user,
    retry: false,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const fila = useQuery({
    queryKey: [...chave, "fila"],
    queryFn: () => filaFn({ data: { clinicaId: clinicaId! } }),
    enabled: !!resumo.data && !resumo.isError,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  if (!clinicaId)
    return <p className="p-4 text-sm">Selecione uma clínica para abrir o dashboard.</p>;
  if (resumo.isError && !resumo.data)
    return (
      <div role="alert" className="rounded-xl border p-5">
        <h1 className="text-lg font-semibold">Dashboard de atendimento indisponível</h1>
        <p className="mt-2 text-sm">{resumo.error.message}</p>
        <button
          type="button"
          className="mt-3 text-sm underline"
          onClick={() => void resumo.refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  return (
    <DashboardOsZapView
      dados={{ resumo: resumo.data, fila: fila.data }}
      dias={dias}
      onDias={setDias}
      agora={agora || Date.now()}
      clinica={clinicaAtual?.clinica.nome ?? ""}
      atualizando={resumo.isFetching || fila.isFetching}
      atualizar={() => {
        void resumo.refetch().then((r) => {
          if (r.isSuccess) void fila.refetch();
        });
      }}
      erros={{ resumo: resumo.error?.message, fila: fila.error?.message }}
      abrir={(aba) => {
        if (aba === "tv") void navegar({ to: "/app/painel-tv-atendimento" });
        else void navegar({ to: "/app/nina", hash: aba });
      }}
    />
  );
}
