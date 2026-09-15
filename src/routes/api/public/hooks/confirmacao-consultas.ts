import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Confirmação automática de consultas pelo WhatsApp.
 *
 * - Chamado pelo pg_cron (job `confirmacao-consultas-whatsapp`) a cada 10 min.
 * - Autenticação: header `x-job-token` comparado com o token guardado em
 *   `sistema_job_tokens` (gerado no próprio banco, nunca versionado e sem
 *   leitura para anon/authenticated). Assim não depende de secret novo no
 *   Lovable Cloud.
 * - Corpo `{ "acao": "rodada" }` (padrão) envia os lembretes;
 *   `{ "acao": "template", "clinica_id": "..." }` submete/atualiza o template
 *   na Meta;
 *   `{ "acao": "teste", "agendamento_id": "...", "telefone": "..." }` manda o
 *   lembrete na hora para um agendamento de TESTE (sem paciente e com nome
 *   iniciado por "TESTE CONFIRMACAO WHATSAPP").
 */
export const Route = createFileRoute("/api/public/hooks/confirmacao-consultas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tk } = await supabaseAdmin
          .from("sistema_job_tokens" as never)
          .select("token")
          .eq("nome", "confirmacao-consultas")
          .maybeSingle();
        const esperado = (tk as { token?: string } | null)?.token ?? "";
        const recebido = request.headers.get("x-job-token") ?? "";
        if (!esperado || !recebido || !safeEq(recebido, esperado)) {
          return json({ error: "unauthorized" }, 401);
        }

        let corpo: {
          acao?: string;
          clinica_id?: string;
          agendamento_id?: string;
          telefone?: string;
        } = {};
        try {
          corpo = (await request.json()) as typeof corpo;
        } catch {
          corpo = {};
        }

        const srv = await import("@/lib/agenda/confirmacao-whatsapp.server");
        try {
          if (corpo.acao === "template") {
            if (!corpo.clinica_id) return json({ error: "clinica_id obrigatório" }, 400);
            const r = await srv.garantirTemplateConfirmacao(corpo.clinica_id, {
              criarSeFaltar: true,
            });
            return json({ ok: true, template: r }, 200);
          }
          if (corpo.acao === "teste") {
            if (!corpo.agendamento_id || !corpo.telefone) {
              return json({ error: "agendamento_id e telefone obrigatórios" }, 400);
            }
            const r = await srv.enviarLembreteTeste({
              agendamentoId: corpo.agendamento_id,
              telefone: corpo.telefone,
            });
            return json(r, r.ok ? 200 : 422);
          }
          const resumo = await srv.executarRodadaConfirmacao();
          return json({ ok: true, resumo }, 200);
        } catch (e) {
          console.error("[confirmacao-consultas] falha", e);
          return json({ error: e instanceof Error ? e.message : String(e) }, 500);
        }
      },
    },
  },
});
