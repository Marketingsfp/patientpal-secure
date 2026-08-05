import { createFileRoute, redirect } from "@tanstack/react-router";

// A aba "Modelos" foi unificada em Convênios > Informações.
export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/modelos")({
  beforeLoad: () => {
    throw redirect({ to: "/app/cartao-beneficios/convenios" });
  },
});
