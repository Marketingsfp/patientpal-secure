import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ContratosPage } from "@/components/pages/contratos-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/contratos")({
  validateSearch: z.object({ contratoId: z.string().uuid().optional() }),
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Contratos — Cartão Benefícios" }] }),
});

function RouteComponent() {
  const { contratoId } = Route.useSearch();
  return <ContratosPage initialContratoId={contratoId} />;
}