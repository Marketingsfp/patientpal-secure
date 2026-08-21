// Base canônica da API de integração: /api/public/integrations/v1/*
//
// Fica sob `/api/public/` porque esse prefixo é o único que dispensa o login
// do site publicado — chamadas externas por chave de API precisam disso.
// A segurança é feita dentro do handler (chave, escopo, rate limit).
import { createFileRoute } from "@tanstack/react-router";
import { handleIntegracoesV1 } from "@/lib/integracoes/agendamentos-v1.server";

export const Route = createFileRoute("/api/public/integrations/v1/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleIntegracoesV1(request, params._splat ?? ""),
      POST: async ({ request, params }) => handleIntegracoesV1(request, params._splat ?? ""),
      OPTIONS: async ({ request, params }) => handleIntegracoesV1(request, params._splat ?? ""),
    },
  },
});
