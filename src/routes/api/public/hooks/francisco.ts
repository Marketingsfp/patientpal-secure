import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/hooks/francisco")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("sistema_job_tokens" as never)
          .select("token")
          .eq("nome", "francisco-orcamentos")
          .maybeSingle();
        const esperado = Buffer.from((data as { token?: string } | null)?.token ?? "");
        const recebido = Buffer.from(request.headers.get("x-job-token") ?? "");
        if (
          error ||
          !esperado.length ||
          esperado.length !== recebido.length ||
          !timingSafeEqual(esperado, recebido)
        )
          return Response.json({ error: "unauthorized" }, { status: 401 });
        try {
          const { executarRodadaFrancisco } = await import("@/lib/francisco/runner.server");
          return Response.json(await executarRodadaFrancisco());
        } catch {
          return Response.json(
            { error: "Rodada do Francisco interrompida. Conferir configuração e histórico." },
            { status: 503 },
          );
        }
      },
    },
  },
});
