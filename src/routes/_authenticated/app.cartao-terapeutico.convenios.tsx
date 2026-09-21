import { createFileRoute } from "@tanstack/react-router";
import { ConveniosPage } from "@/components/cartao/convenios-page";

export const Route = createFileRoute("/_authenticated/app/cartao-terapeutico/convenios")({
  component: () => <ConveniosPage produto="terapeutico" />,
  head: () => ({ meta: [{ title: "Convênios — Cartão Terapêutico" }] }),
});
