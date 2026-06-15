import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

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
    // Preload desabilitado: tanto "viewport" quanto "intent" estavam
    // disparando loadRouteMatch em matches ainda não inicializados e
    // quebrando navegação com "Cannot read properties of undefined
    // (reading '_nonReactive')", deixando cliques de menu sem resposta.
    defaultPreload: false,
  });

  return router;
};
