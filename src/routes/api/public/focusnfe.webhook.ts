import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function validBasicAuth(authHeader: string | null, token: string): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  const expected = "Basic " + Buffer.from(`${token}:`).toString("base64");
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Webhook do Focus NFe. Recebe notificações de mudança de status
 * (autorizado, cancelado, erro). Configure no painel Focus:
 * https://api.focusnfe.com.br/painel/webhooks/ apontando para esta URL.
 */
export const Route = createFileRoute("/api/public/focusnfe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.FOCUS_WEBHOOK_TOKEN;
        if (!token) {
          // Refuse to process if the webhook secret is not configured.
          return new Response("Webhook not configured", { status: 503 });
        }
        if (!validBasicAuth(request.headers.get("authorization"), token)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json().catch(() => null)) as
          | { ref?: string; status?: string; numero?: string; serie?: string; codigo_verificacao?: string; caminho_xml_nota_fiscal?: string; caminho_danfse?: string; mensagem_sefaz?: string }
          | null;
        if (!body?.ref) return new Response("missing ref", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const updates: Record<string, unknown> = {
          focus_status: body.status ?? null,
          payload_resposta: body,
        };
        if (body.status === "autorizado") {
          updates.status = "emitida";
          updates.numero = body.numero ?? null;
          updates.serie = body.serie ?? null;
          updates.codigo_verificacao = body.codigo_verificacao ?? null;
          if (body.caminho_danfse) updates.url_pdf = `https://api.focusnfe.com.br${body.caminho_danfse}`;
          if (body.caminho_xml_nota_fiscal) updates.url_xml = `https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}`;
        } else if (body.status === "cancelado") {
          updates.status = "cancelada";
          updates.cancelada_em = new Date().toISOString();
        } else if (body.status === "erro_autorizacao" || body.status === "erro") {
          updates.status = "erro";
          updates.erro_mensagem = body.mensagem_sefaz ?? null;
        }

        await supabaseAdmin
          .from("nfse")
          .update(updates as never)
          .eq("focus_ref", body.ref);

        return new Response("ok");
      },
      GET: async () => new Response("focusnfe webhook ok"),
    },
  },
});