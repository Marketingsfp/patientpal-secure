import { createFileRoute } from "@tanstack/react-router";
import { DependentesPage } from "@/components/cartao/dependentes-page";

export const Route = createFileRoute("/_authenticated/app/cartao-terapeutico/dependentes")({
  component: () => <DependentesPage produto="terapeutico" />,
  head: () => ({ meta: [{ title: "Dependentes — Cartão Terapêutico" }] }),
});
