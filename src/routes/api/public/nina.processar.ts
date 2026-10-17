import { createFileRoute } from "@tanstack/react-router";

/**
 * Resposta da Nina acionada pelo banco (pg_net), fora da requisição da Meta.
 * Exige o token interno; o corpo traz só o id da tarefa e o token dela.
 */
export const Route = createFileRoute("/api/public/nina/processar")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { servico: "nina-processar-v1" },
          { headers: { "cache-control": "no-store" } },
        ),
      POST: async ({ request }) => {
        const [
          { supabaseAdmin },
          { executarTarefaWhatsapp },
          { processarRespostaWhatsappNina },
          { loadWhatsAppConfig },
          handoff,
          { ninaDesativadaNaClinica },
        ] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/nina/whatsapp-assincrono.server"),
          import("@/lib/nina/whatsapp-processamento.server"),
          import("@/lib/whatsapp.server"),
          import("@/lib/atendimento/handoff.server"),
          import("@/lib/nina-desligada.server"),
        ]);
        return executarTarefaWhatsapp(request, {
          admin: supabaseAdmin,
          processar: processarRespostaWhatsappNina,
          carregarConfig: loadWhatsAppConfig,
          estadoConversaPorTelefone: handoff.estadoConversaPorTelefone as never,
          ninaPodeResponder: handoff.ninaPodeResponder as never,
          ninaDesativada: ninaDesativadaNaClinica,
          atribuirAtendenteOnline: handoff.atribuirAtendenteOnline,
          encaminharParaHumano: handoff.encaminharParaHumano,
        });
      },
    },
  },
});
