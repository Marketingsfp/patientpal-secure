// Alias amigável: /api/integrations/v1/*
//
// Mesmo handler da base canônica. Útil na prévia e para chamadas internas;
// para o sistema externo, use /api/public/integrations/v1/*, que não passa
// pelo login do site publicado.
import { createFileRoute } from "@tanstack/react-router";
import { handleIntegracoesV1 } from "@/lib/integracoes/agendamentos-v1.server";

export const Route = createFileRoute("/api/integrations/v1/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleIntegracoesV1(request, params._splat ?? ""),
      POST: async ({ request, params }) => handleIntegracoesV1(request, params._splat ?? ""),
      OPTIONS: async ({ request, params }) => handleIntegracoesV1(request, params._splat ?? ""),
    },
  },
});
