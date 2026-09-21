import { createFileRoute } from "@tanstack/react-router";
import { DependentesPage } from "@/components/cartao/dependentes-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/dependentes")({
  component: () => <DependentesPage produto="beneficios" />,
  head: () => ({ meta: [{ title: "Dependentes — Cartão Benefícios" }] }),
});
