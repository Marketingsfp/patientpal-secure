import { createFileRoute } from "@tanstack/react-router";
import { EXECUTOR_CARGA_SERVIDOR } from "@/lib/nina/carga-paralela";

export const Route = createFileRoute("/api/public/nina/carga")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { executor: EXECUTOR_CARGA_SERVIDOR },
          { headers: { "cache-control": "no-store" } },
        ),
      POST: async ({ request }) => {
        const [
          { supabaseAdmin },
          { executarJobCarga },
          { prepararCargaControlada },
          { processarMensagemTeste },
        ] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/nina/carga-servidor.server"),
          import("@/lib/nina/carga-preparacao.server"),
          import("@/lib/nina/teste-console.server"),
        ]);
        return executarJobCarga(request, {
          admin: supabaseAdmin,
          preparar: prepararCargaControlada,
          processar: processarMensagemTeste,
        });
      },
    },
  },
});
