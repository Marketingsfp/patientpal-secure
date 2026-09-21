import { createFileRoute } from "@tanstack/react-router";
import { ConveniosPage } from "@/components/cartao/convenios-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/convenios")({
  component: () => <ConveniosPage produto="beneficios" />,
  head: () => ({ meta: [{ title: "Convênios — Cartão Benefícios" }] }),
});
