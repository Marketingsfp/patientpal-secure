import { createFileRoute, redirect } from "@tanstack/react-router";
import { setSubsystem } from "@/lib/subsystem";

export const Route = createFileRoute("/_authenticated/app/")({
  beforeLoad: () => {
    // Só existe um subsistema ("Gestor Clínico"). Entra direto no painel.
    if (typeof window !== "undefined") setSubsystem("recepcao");
    throw redirect({ to: "/app/painel" });
  },
});
