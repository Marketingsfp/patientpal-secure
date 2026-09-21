import { createFileRoute } from "@tanstack/react-router";
import { ConferenciaPage } from "@/components/cartao/conferencia-page";

export const Route = createFileRoute("/_authenticated/app/cartao-terapeutico/conferencia")({
  component: () => <ConferenciaPage produto="terapeutico" />,
  head: () => ({ meta: [{ title: "Conferência — Cartão Terapêutico" }] }),
});
