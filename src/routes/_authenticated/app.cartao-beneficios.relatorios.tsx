import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosPage } from "@/components/cartao/relatorios-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/relatorios")({
  component: () => <RelatoriosPage produto="beneficios" />,
  head: () => ({ meta: [{ title: "Relatórios — Cartão Benefícios" }] }),
});
