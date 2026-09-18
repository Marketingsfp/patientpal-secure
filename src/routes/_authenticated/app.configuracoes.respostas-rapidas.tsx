import { createFileRoute, redirect } from "@tanstack/react-router";

// A aba foi retirada. Links antigos retornam à caixa de atendimento.
export const Route = createFileRoute("/_authenticated/app/configuracoes/respostas-rapidas")({
  beforeLoad: () => {
    throw redirect({ to: "/app/nina", hash: "atend-macros", replace: true });
  },
});
