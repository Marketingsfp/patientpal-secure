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

const HEADERS_RELEVANTES = [
  "x-hub-signature-256",
  "x-hub-signature",
  "content-type",
  "user-agent",
  "x-forwarded-for",
];

/** Registra a requisição crua antes de qualquer validação. Nunca lança. */
async function registrarLogWebhook(
  clinicaId: string,
  metodo: string,
  request: Request,
  corpo: string,
): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const headers: Record<string, string> = {};
    for (const nome of HEADERS_RELEVANTES) {
      const v = request.headers.get(nome);
      if (v) headers[nome] = v;
    }
    const { data, error } = await supabaseAdmin
      .from("whatsapp_webhook_logs")
      .insert({
        clinica_id: clinicaId,
        metodo,
        headers,
        assinatura: request.headers.get("x-hub-signature-256"),
        corpo: corpo.slice(0, 8192),
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("whatsapp webhook log insert error", error.message);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (e) {
    console.error("whatsapp webhook log error", e);
    return null;
  }
}

/** Preenche o campo `resultado` do log. Nunca lança. */
async function marcarResultado(logId: string | null, resultado: string) {
  if (!logId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("whatsapp_webhook_logs")
      .update({ resultado: resultado.slice(0, 500) })
      .eq("id", logId);
  } catch (e) {
    console.error("whatsapp webhook log update error", e);
  }
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

        const logId = await registrarLogWebhook(params.clinicaId, "GET", request, url.search);

        const cfg = await loadWhatsAppConfig(params.clinicaId).catch(() => null);
        if (!cfg) {
          await marcarResultado(logId, "erro:clínica sem configuração de WhatsApp");
          return new Response("Not found", { status: 404 });
        }

        if (mode === "subscribe" && token && token === cfg.verify_token) {
          await marcarResultado(logId, "processado_ok");
          return new Response(challenge ?? "", { status: 200 });
        }
        await marcarResultado(logId, "erro:verify_token inválido");
        return new Response("Forbidden", { status: 403 });
      },

      // Meta envia POST para cada evento
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rawBody = await request.text();
        const logId = await registrarLogWebhook(params.clinicaId, "POST", request, rawBody);
        let resultado = "evento_ignorado";
        try {
          const cfg = await loadWhatsAppConfig(params.clinicaId).catch(() => null);
          if (!cfg) {
            resultado = "erro:clínica sem configuração de WhatsApp";
            return new Response("Not found", { status: 404 });
          }
          if (!cfg.access_token) {
            resultado = "erro:access token ausente";
            return new Response("Not configured", { status: 412 });
          }

          const sigHeader = request.headers.get("x-hub-signature-256");
          // Assinatura não confere (ou App Secret vazio/errado): registramos, mas
          // NUNCA descartamos a mensagem do paciente.
          const assinaturaOk = Boolean(
            cfg.app_secret && verifySignature(cfg.app_secret, rawBody, sigHeader),
          );
          if (!assinaturaOk) resultado = "assinatura_invalida";

          let payload: any;
          try {
            payload = JSON.parse(rawBody);
          } catch {
            resultado = "erro:corpo não é JSON válido";
            return new Response("Bad request", { status: 400 });
          }

          let processou = false;
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
                processou = true;
                const from = String(msg.from ?? "");
                const wa_message_id = String(msg.id ?? "");
                const tipoBruto = String(msg.type ?? "text");
                const tipo = tipoBruto === "voice" ? "audio" : tipoBruto;
                const ehAudio = tipo === "audio";

                // Texto do paciente que a Nina vai processar (áudio vira transcrição).
                let textoPaciente = tipo === "text" ? String(msg.text?.body ?? "") : "";
                let transcricao: string | null = null;
                let audioFalhou = false;
                let mediaMime: string | null = null;

                if (ehAudio && cfg.access_token) {
                  const mediaId = String(msg.audio?.id ?? msg.voice?.id ?? "");
                  if (mediaId) {
                    const { transcreverAudioWhatsapp } =
                      await import("@/lib/whatsapp-midia.server");
                    const r = await transcreverAudioWhatsapp(mediaId, cfg.access_token);
                    mediaMime = r.mime;
                    if (r.texto) {
                      transcricao = r.texto;
                      textoPaciente = r.texto;
                    } else {
                      audioFalhou = true;
                      if (r.erro) console.error("transcrição de áudio falhou", r.erro);
                    }
                  } else {
                    audioFalhou = true;
                  }
                }

                const body = ehAudio
                  ? transcricao
                    ? `🎤 ${transcricao}`
                    : "🎤 [áudio não transcrito]"
                  : tipo === "text"
                    ? String(msg.text?.body ?? "")
                    : `[${tipo}]`;

                await supabaseAdmin.from("whatsapp_mensagens").insert({
                  clinica_id: params.clinicaId,
                  wa_message_id,
                  direction: "in",
                  from_number: from,
                  to_number: displayPhoneNumber,
                  body,
                  tipo,
                  transcricao,
                  media_mime: mediaMime,
                  status: "received",
                  enviada_por: "paciente",
                  raw: msg,
                });

                // Mensagem nova do paciente reabre conversa fechada.
                if (from) {
                  await supabaseAdmin
                    .from("atend_conversas")
                    .update({ status: "aberta", ultima_msg_em: new Date().toISOString() })
                    .eq("clinica_id", params.clinicaId)
                    .eq("contato_telefone", from)
                    .neq("status", "aberta");
                }

                // Modo híbrido: Nina responde fora do horário humano.
                // Se a clínica desligou a Nina (flag `nina_desativada`), não responde nada.
                const { ninaDesativadaNaClinica } = await import("@/lib/nina-desligada.server");
                const ninaOff = await ninaDesativadaNaClinica(params.clinicaId);
                const foraDoHorario = !dentroHorarioAtendimento(cfg);
                const deveResponder =
                  !ninaOff &&
                  foraDoHorario &&
                  (Boolean(textoPaciente) ||
                    audioFalhou ||
                    ["image", "document", "sticker"].includes(tipo));

                if (deveResponder) {
                  try {
                    if (!phoneNumberId) {
                      throw new Error(
                        "WhatsApp não configurado: Phone Number ID ausente na configuração e no webhook da Meta.",
                      );
                    }
                    const { RESPOSTA_AUDIO_FALHOU, respostaMidiaNaoSuportada } =
                      await import("@/lib/whatsapp-midia.server");
                    let reply = "";
                    if (textoPaciente) {
                      reply = await gerarRespostaNina(params.clinicaId, textoPaciente, from);
                    } else if (audioFalhou) {
                      reply = RESPOSTA_AUDIO_FALHOU;
                    } else {
                      reply = respostaMidiaNaoSuportada(tipo);
                    }
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

          if (processou && resultado !== "assinatura_invalida") resultado = "processado_ok";
          return new Response("ok", { status: 200 });
        } catch (e) {
          resultado = `erro:${String((e as Error)?.message ?? e)}`;
          console.error("whatsapp webhook error", e);
          return new Response("ok", { status: 200 });
        } finally {
          await marcarResultado(logId, resultado);
        }
      },
    },
  },
});
