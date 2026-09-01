// Endpoint público do site institucional da CLÍNICA CONSULTA HOJE (Queimados/RJ).
//
// Mesma lógica de /api/public/intake, apenas com outra clínica-alvo. A clínica
// nunca vem do corpo ou da query: fica fixa no servidor, por rota.
import { createFileRoute } from "@tanstack/react-router";
import { handleIntake, INTAKE_CLINICA_ID_CONSULTA_HOJE } from "@/lib/integracoes/intake.server";

export const Route = createFileRoute("/api/public/intake-consulta-hoje")({
  server: {
    handlers: {
      POST: async ({ request }) => handleIntake(request, INTAKE_CLINICA_ID_CONSULTA_HOJE),
      OPTIONS: async ({ request }) => handleIntake(request, INTAKE_CLINICA_ID_CONSULTA_HOJE),
    },
  },
});
