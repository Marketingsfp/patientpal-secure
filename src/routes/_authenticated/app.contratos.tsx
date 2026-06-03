import { createFileRoute } from "@tanstack/react-router";
import { ContratosPage } from "@/components/pages/contratos-page";

export const Route = createFileRoute("/_authenticated/app/contratos")({
  component: ContratosPage,
  head: () => ({ meta: [{ title: "Contratos — ClinicaOS" }] }),
});
