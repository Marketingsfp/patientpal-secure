import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosPage } from "@/components/cartao/relatorios-page";

export const Route = createFileRoute("/_authenticated/app/cartao-terapeutico/relatorios")({
  component: () => <RelatoriosPage produto="terapeutico" />,
  head: () => ({ meta: [{ title: "Relatórios — Cartão Terapêutico" }] }),
});
