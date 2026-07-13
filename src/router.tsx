import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultPending() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cache padr o: dados frescos por 1 min, mantidos em mem ria por 10 min.
        // Evita refetch a cada navega o entre telas (agenda, financeiro, m dicos).
        // Dados ficam frescos por 5 min e em memória por 30 min.
        // Reduz drasticamente refetches ao navegar entre telas.
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // "intent" baixa o chunk da rota quando o usuário passa o mouse/foca
    // um <Link>. Elimina o flash branco ao navegar entre telas grandes
    // (agenda, financeiro, prontuário) porque o JS já está em cache no
    // momento do clique. O bug antigo de "_nonReactive" foi corrigido nas
    // versões recentes do @tanstack/react-router.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // Se a próxima rota demorar >200ms para resolver, mostra o spinner
    // em vez de tela branca. Se resolver antes, transição direta.
    defaultPendingMs: 200,
    defaultPendingMinMs: 0,
    defaultPendingComponent: DefaultPending,
  });

  return router;
};
