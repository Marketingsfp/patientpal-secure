import { createFileRoute } from "@tanstack/react-router";
import { PlanosPage } from "./app.planos";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/modelos")({
  component: PlanosPage,
  head: () => ({ meta: [{ title: "Modelos de contrato — Cartão Benefícios" }] }),
});