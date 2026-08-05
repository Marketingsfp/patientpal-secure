import { createFileRoute, redirect } from "@tanstack/react-router";

// Tela unificada: os "planos" agora são cadastrados em
// Cartão Benefícios > Convênios > Informações.
export const Route = createFileRoute("/_authenticated/app/planos")({
  beforeLoad: () => {
    throw redirect({ to: "/app/cartao-beneficios/convenios" });
  },
});
