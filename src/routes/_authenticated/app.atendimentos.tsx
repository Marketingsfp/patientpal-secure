import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias legado: redireciona /app/atendimentos → /app/financeiro/atendimentos.
// (Antes: importava `AtendimentosPage` da rota de destino, o que quebrava o
// code-splitting do TanStack e derrubava a árvore de rotas com
// "Cannot read properties of undefined (reading 'update')".)
export const Route = createFileRoute("/_authenticated/app/atendimentos")({
  beforeLoad: () => {
    throw redirect({ to: "/app/financeiro/atendimentos" });
  },
});