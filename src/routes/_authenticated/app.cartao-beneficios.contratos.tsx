import { createFileRoute } from "@tanstack/react-router";
import { ContratosPage } from "./app.contratos";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/contratos")({
  component: ContratosPage,
  head: () => ({ meta: [{ title: "Contratos — Cartão Benefícios" }] }),
});