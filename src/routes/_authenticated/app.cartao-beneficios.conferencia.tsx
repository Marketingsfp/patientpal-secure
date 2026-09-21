import { createFileRoute } from "@tanstack/react-router";
import { ConferenciaPage } from "@/components/cartao/conferencia-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/conferencia")({
  component: () => <ConferenciaPage produto="beneficios" />,
  head: () => ({ meta: [{ title: "Conferência — Cartão Benefícios" }] }),
});
