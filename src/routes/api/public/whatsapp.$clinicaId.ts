import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import {
  loadWhatsAppConfig,
  metaSendText,
  dentroHorarioAtendimento,
  gerarRespostaNina,
} from "@/lib/whatsapp.server";

function verifySignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function textoLimpo(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

async function registrarStatusWhatsapp(clinicaId: string, ok: boolean, erro?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("whatsapp_configs")
    .update({
      ultimo_teste_em: new Date().toISOString(),
      ultimo_teste_ok: ok,
      ultimo_teste_erro: ok ? null : (erro ?? "Falha ao enviar resposta automática").slice(0, 500),
    })
    .eq("clinica_id", clinicaId);
}

export const Route = createFileRoute("/api/public/whatsapp/$clinicaId")({
  server: {
    handlers: {
      // Meta envia GET para verificar o webhook na hora de configurar
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const cfg = await loadWhatsAppConfig(params.clinicaId).catch(() => null);
        if (!cfg) return new Response("Not found", { status: 404 });

        if (mode === "subscribe" && token && token === cfg.verify_token) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      // Meta envia POST para cada evento
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rawBody = await request.text();
        const cfg = await loadWhatsAppConfig(params.clinicaId).catch(() => null);
        if (!cfg) return new Response("Not found", { status: 404 });
        if (!cfg.app_secret || !cfg.access_token) {
          return new Response("Not configured", { status: 412 });
        }

        const sigHeader = request.headers.get("x-hub-signature-256");
        if (!verifySignature(cfg.app_secret, rawBody, sigHeader)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const entries: any[] = payload?.entry ?? [];
        for (const entry of entries) {
          const changes: any[] = entry?.changes ?? [];
          for (const change of changes) {
            const value = change?.value ?? {};
            const webhookPhoneNumberId = textoLimpo(value?.metadata?.phone_number_id);
            const displayPhoneNumber =
              textoLimpo(value?.metadata?.display_phone_number) ?? cfg.display_phone_number;
            const phoneNumberId = webhookPhoneNumberId ?? textoLimpo(cfg.phone_number_id);
            const messages: any[] = value?.messages ?? [];
            for (const msg of messages) {
              const from = String(msg.from ?? "");
              const wa_message_id = String(msg.id ?? "");
              const tipo = String(msg.type ?? "text");
              const body = tipo === "text" ? String(msg.text?.body ?? "") : `[${tipo}]`;

              await supabaseAdmin.from("whatsapp_mensagens").insert({
                clinica_id: params.clinicaId,
                wa_message_id,
                direction: "in",
                from_number: from,
                to_number: displayPhoneNumber,
                body,
                tipo,
                status: "received",
                enviada_por: "paciente",
                raw: msg,
              });

              // Modo híbrido: Nina responde fora do horário humano (apenas texto).
              // Se a clínica desligou a Nina (flag `nina_desativada`), não responde nada.
              const { ninaDesativadaNaClinica } = await import("@/lib/nina-desligada.server");
              const ninaOff = await ninaDesativadaNaClinica(params.clinicaId);
              if (!ninaOff && tipo === "text" && body && !dentroHorarioAtendimento(cfg)) {
                try {
                  if (!phoneNumberId) {
                    throw new Error(
                      "WhatsApp não configurado: Phone Number ID ausente na configuração e no webhook da Meta.",
                    );
                  }
                  const reply = await gerarRespostaNina(params.clinicaId, body, from);
                  if (reply) {
                    const { wa_message_id: outId } = await metaSendText(
                      phoneNumberId,
                      cfg.access_token,
                      from,
                      reply,
                    );
                    await supabaseAdmin.from("whatsapp_mensagens").insert({
                      clinica_id: params.clinicaId,
                      wa_message_id: outId,
                      direction: "out",
                      from_number: displayPhoneNumber,
                      to_number: from,
                      body: reply,
                      tipo: "text",
                      status: "sent",
                      enviada_por: "nina",
                    });
                    if (webhookPhoneNumberId && webhookPhoneNumberId !== cfg.phone_number_id) {
                      await supabaseAdmin
                        .from("whatsapp_configs")
                        .update({
                          phone_number_id: webhookPhoneNumberId,
                          display_phone_number: displayPhoneNumber,
                          ultimo_teste_em: new Date().toISOString(),
                          ultimo_teste_ok: true,
                          ultimo_teste_erro: null,
                        })
                        .eq("clinica_id", params.clinicaId);
                    }
                  }
                } catch (e) {
                  console.error("Nina autoreply error", e);
                  await registrarStatusWhatsapp(
                    params.clinicaId,
                    false,
                    String((e as Error)?.message ?? e),
                  );
                }
              }
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
