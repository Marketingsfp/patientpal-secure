import { createFileRoute } from "@tanstack/react-router";

/**
 * Envio automático do relatório diário (07:00–19:00) às 20:00.
 *
 * Chamado pelo cron (pg_cron + pg_net) todo dia às 20:00 (horário de Brasília).
 * Autenticado pelo header `apikey` com a chave publicável do projeto,
 * padrão dos demais jobs internos.
 */
export const Route = createFileRoute("/api/public/hooks/relatorio-diario")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const esperado =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const recebido = request.headers.get("apikey") ?? "";
        if (!esperado || recebido !== esperado) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { enviarRelatorioWhatsApp, dataHojeSP } = await import(
          "@/lib/relatorio-diario.server"
        );

        let corpo: { data?: string } = {};
        try {
          corpo = (await request.json()) as { data?: string };
        } catch {
          corpo = {};
        }
        const dia = corpo.data ?? dataHojeSP();

        try {
          const r = await enviarRelatorioWhatsApp(dia);
          return Response.json({ ok: true, data: dia, enviados: r.enviados, erros: r.erros });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});