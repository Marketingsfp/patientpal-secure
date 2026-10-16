import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { PortalLauncher } from "@/components/portal-launcher";
import { useClinica } from "@/hooks/use-clinica";
import { usePermissoes } from "@/hooks/use-permissoes";
import { portaisOcultos } from "@/lib/portais-visiveis";
import { setSubsystem, SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";

export const Route = createFileRoute("/_authenticated/app/")({
  component: PortalLauncherPage,
});

function PortalLauncherPage() {
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const { allowed, configured, loading } = usePermissoes();

  // Portal sem nenhuma tela liberada nem aparece — nada de "Acesso negado"
  // depois do clique. Mesma regra do seletor do cabeçalho.
  const ocultos = useMemo<SubsystemId[]>(
    () => portaisOcultos(allowed, configured, clinicaAtual?.role),
    [allowed, configured, clinicaAtual?.role],
  );
  const visiveis = (Object.keys(SUBSYSTEMS) as SubsystemId[]).filter((id) => !ocultos.includes(id));

  const abrir = (id: SubsystemId) => {
    setSubsystem(id);
    navigate({ to: SUBSYSTEMS[id].home });
  };

  // Enquanto carrega, ou quando só sobra um portal (o AppShell leva a pessoa
  // direto para ele), a tela fica vazia em vez de piscar um cartão único.
  if (loading || visiveis.length <= 1) return null;

  return <PortalLauncher onPick={abrir} ocultos={ocultos} />;
}
