import { createFileRoute } from "@tanstack/react-router";
import { PlanosPage } from "@/components/pages/planos-page";

export const Route = createFileRoute("/_authenticated/app/planos")({
  component: PlanosPage,
  head: () => ({ meta: [{ title: "Planos de Assinatura — ClinicaOS" }] }),
});
