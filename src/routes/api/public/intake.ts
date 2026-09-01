// Endpoint público do site institucional: /api/public/intake
//
// Sem chave de API e com CORS liberado, porque quem chama é o navegador de um
// visitante anônimo. A segurança fica no handler (validação, limite por IP/CPF,
// clínica fixa no servidor, nenhuma leitura devolvida).
import { createFileRoute } from "@tanstack/react-router";
import { handleIntake } from "@/lib/integracoes/intake.server";

export const Route = createFileRoute("/api/public/intake")({
  server: {
    handlers: {
      POST: async ({ request }) => handleIntake(request),
      OPTIONS: async ({ request }) => handleIntake(request),
    },
  },
});
