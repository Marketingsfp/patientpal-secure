import { createFileRoute } from "@tanstack/react-router";
import { PlanosPage } from "@/components/pages/planos-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/modelos")({
  component: () => <PlanosPage modulo="cartao-beneficios" />,
  head: () => ({ meta: [{ title: "Modelos de contrato — Cartão Benefícios" }] }),
});