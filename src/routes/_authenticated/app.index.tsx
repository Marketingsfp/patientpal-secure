import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { PortalLauncher } from "@/components/portal-launcher";
import { usePermissoes } from "@/hooks/use-permissoes";
import { setSubsystem, SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";

export const Route = createFileRoute("/_authenticated/app/")({
  component: PortalLauncherPage,
});

function PortalLauncherPage() {
  const navigate = useNavigate();
  const { allowed } = usePermissoes();

  // O OS ZAP usa o módulo "nina" (o mesmo de antes). Quem não tem esse módulo
  // simplesmente não vê o cartão — nada de tela branca depois do clique.
  const ocultos = useMemo<SubsystemId[]>(
    () => (allowed === null || allowed.has("nina") ? [] : ["os-zap"]),
    [allowed],
  );

  const abrir = (id: SubsystemId) => {
    setSubsystem(id);
    navigate({ to: SUBSYSTEMS[id].home });
  };

  return <PortalLauncher onPick={abrir} ocultos={ocultos} />;
}
