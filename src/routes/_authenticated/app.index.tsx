import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { PortalLauncher } from "@/components/portal-launcher";
import { usePermissoes } from "@/hooks/use-permissoes";
import { podeAbrirPortalRh } from "@/lib/permissoes-rotas";
import { setSubsystem, SUBSYSTEMS, type SubsystemId } from "@/lib/subsystem";

export const Route = createFileRoute("/_authenticated/app/")({
  component: PortalLauncherPage,
});

function PortalLauncherPage() {
  const navigate = useNavigate();
  const { allowed, configured } = usePermissoes();

  // O OS ZAP usa o módulo "nina" (o mesmo de antes). Quem não tem esse módulo
  // simplesmente não vê o cartão — nada de tela branca depois do clique.
  // Funcionários / RH segue a mesma ideia, pelas telas de Recursos Humanos.
  const ocultos = useMemo<SubsystemId[]>(() => {
    const lista: SubsystemId[] = [];
    if (allowed !== null && !allowed.has("nina")) lista.push("os-zap");
    if (!podeAbrirPortalRh(allowed, configured)) lista.push("gestao-pessoas");
    return lista;
  }, [allowed, configured]);

  const abrir = (id: SubsystemId) => {
    setSubsystem(id);
    navigate({ to: SUBSYSTEMS[id].home });
  };

  return <PortalLauncher onPick={abrir} ocultos={ocultos} />;
}
