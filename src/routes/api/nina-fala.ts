import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "@/integrations/supabase/env";
import {
  assertMembership,
  contextoClinicaTexto,
  systemPromptNina,
} from "@/lib/nina-contexto.server";
import { hojeBR, janelaDiaClinica } from "@/lib/date-utils";
import { z } from "zod";

/**
 * Nina conversando: resposta e voz no MESMO stream.
 *
 * Latência: em vez de esperar o texto inteiro da IA e só então pedir o áudio,
 * aqui a resposta é gerada em streaming e a primeira frase já vai para o TTS.
 * Assim a Nina começa a falar em ~1 s, não depois de gerar tudo.
 *
 * Eventos SSE devolvidos ao navegador:
 * - `{ type: "text", delta }`            → texto conforme sai da IA
 * - `{ type: "speech.audio.delta", audio }` → PCM 24 kHz base64, na ordem
 * - `{ type: "erro", mensagem }`
 */

const MODELO_TEXTO = "google/gemini-3.1-flash-lite";
/** TTS mais leve do catálogo = primeiro pedaço de áudio mais rápido. */
const MODELO_VOZ = "google/gemini-3.1-flash-tts-preview";
const VOZ = "Leda";

const Body = z.object({
  clinicaId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

/** Primeira "fatia falável": frase completa ou pedaço curto o suficiente. */
function cortarFala(buffer: string, minimo: number): { fala: string; resto: string } | null {
  if (buffer.length < minimo) return null;
  const janela = buffer.slice(minimo);
  const m = janela.match(/[.!?…]\s|\n/);
  if (m && m.index !== undefined) {
    const corte = minimo + m.index + m[0].length;
    return { fala: buffer.slice(0, corte).trim(), resto: buffer.slice(corte) };
  }
  if (buffer.length > minimo * 4) {
    const esp = buffer.lastIndexOf(" ", minimo * 3);
    if (esp > minimo) return { fala: buffer.slice(0, esp).trim(), resto: buffer.slice(esp + 1) };
  }
  return null;
}

function limparParaFala(t: string) {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~#>|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const Route = createFileRoute("/api/nina-fala")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("voz indisponível", { status: 503 });

        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const { url, publishableKey } = requireSupabasePublicEnv();
        const supabase = createClient(url, publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: erroClaims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (erroClaims || !userId) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return new Response("payload inválido", { status: 400 });
        }

        try {
          await assertMembership(supabase, userId, body.clinicaId);
        } catch {
          return new Response("Forbidden", { status: 403 });
        }

        const janela = janelaDiaClinica(hojeBR());
        const contexto = await contextoClinicaTexto(supabase, body.clinicaId, janela);
        const systemPrompt = systemPromptNina(contexto, true);

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const enviar = (obj: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

            // Fila de TTS: pedidos disparam já, mas o áudio é repassado em ordem.
            let ultimo: Promise<void> = Promise.resolve();
            const falar = (texto: string) => {
              const t = limparParaFala(texto);
              if (!t) return;
              const pedido = fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: MODELO_VOZ,
                  stream_format: "sse",
                  contents: [{ role: "user", parts: [{ text: t }] }],
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } },
                    },
                  },
                }),
              });
              ultimo = ultimo.then(async () => {
                const res = await pedido.catch(() => null);
                if (!res?.ok || !res.body) return;
                const leitor = res.body.pipeThrough(new TextDecoderStream()).getReader();
                let buf = "";
                while (true) {
                  const { value, done } = await leitor.read();
                  if (done) break;
                  buf += value;
                  const linhas = buf.split("\n");
                  buf = linhas.pop() ?? "";
                  for (const linha of linhas) {
                    if (!linha.startsWith("data:")) continue;
                    const bruto = linha.slice(5).trim();
                    if (!bruto || bruto === "[DONE]") continue;
                    try {
                      const ev = JSON.parse(bruto) as { type?: string; audio?: string };
                      if (ev.type === "speech.audio.delta" && ev.audio) enviar(ev);
                    } catch {
                      /* linha parcial */
                    }
                  }
                }
              });
            };

            try {
              const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: MODELO_TEXTO,
                  stream: true,
                  max_tokens: 220,
                  messages: [{ role: "system", content: systemPrompt }, ...body.messages],
                }),
              });
              if (!res.ok || !res.body) {
                enviar({ type: "erro", mensagem: `Falha na resposta da Nina (${res.status})` });
                controller.close();
                return;
              }

              const leitor = res.body.pipeThrough(new TextDecoderStream()).getReader();
              let buf = "";
              let pendente = "";
              let primeira = true;
              while (true) {
                const { value, done } = await leitor.read();
                if (done) break;
                buf += value;
                const linhas = buf.split("\n");
                buf = linhas.pop() ?? "";
                for (const linha of linhas) {
                  if (!linha.startsWith("data:")) continue;
                  const bruto = linha.slice(5).trim();
                  if (!bruto || bruto === "[DONE]") continue;
                  let delta = "";
                  try {
                    const j = JSON.parse(bruto);
                    delta = j?.choices?.[0]?.delta?.content ?? "";
                  } catch {
                    continue;
                  }
                  if (!delta) continue;
                  enviar({ type: "text", delta });
                  pendente += delta;
                  // A primeira fatia é curta de propósito: começar a falar antes.
                  const corte = cortarFala(pendente, primeira ? 40 : 140);
                  if (corte) {
                    primeira = false;
                    pendente = corte.resto;
                    falar(corte.fala);
                  }
                }
              }
              if (pendente.trim()) falar(pendente);
              await ultimo;
            } catch (e) {
              enviar({ type: "erro", mensagem: (e as Error)?.message ?? "erro" });
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
