import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PortalLauncher } from "@/components/portal-launcher";
import { setSubsystem, SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";

export const Route = createFileRoute("/_authenticated/app/")({
  component: PortalLauncherPage,
});

function PortalLauncherPage() {
  const navigate = useNavigate();

  const abrir = (id: SubsystemId) => {
    setSubsystem(id);
    navigate({ to: SUBSYSTEMS[id].home });
  };

  return <PortalLauncher onPick={abrir} />;
}
