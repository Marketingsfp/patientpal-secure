import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy de TTS para o backend de IA local (Piper) da Policlínica Menino Jesus.
 *
 * Motivo do proxy: o endpoint https://server-mj.tailec426c.ts.net/api/tts fica
 * em uma rede Tailscale privada e não libera CORS para *.lovable.app. Aqui,
 * o backend do TanStack faz a chamada server-side e devolve o áudio para o
 * navegador — resolve CORS e mantém a URL/segredo do servidor fora do bundle.
 *
 * Rota pública (bypass de auth do site publicado). Não recebemos dados
 * sensíveis do paciente aqui: apenas o texto a ser sintetizado. Ainda assim,
 * validamos tamanho para evitar abuso.
 */

const TTS_UPSTREAM = process.env.TTS_UPSTREAM_URL ?? "https://server-mj.tailec426c.ts.net/api/tts";
const MAX_TEXT = 4000;
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Nome de voz do Piper (ex.: "faber", "feminina"). Não validamos contra uma
 * lista fixa para não acoplar a rota ao catálogo do servidor, mas restringimos
 * o formato: o valor é repassado ao upstream e não pode carregar payload.
 */
const VOICE_RE = /^[a-z0-9_-]{1,32}$/i;

/**
 * Fallback: quando o Piper local está fora do ar (502/timeout), sintetiza a voz
 * pela IA da plataforma para o painel não quebrar.
 *
 * A `voice` pedida pelo cliente NÃO é repassada aqui de propósito: os nomes do
 * Piper ("faber", "feminina") não existem no gateway, que usa o catálogo da
 * OpenAI. O fallback sempre usa "alloy".
 */
async function fallbackTts(text: string): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "tts indisponível" }), {
      status: 503,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice: "alloy",
      response_format: "wav",
    }),
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "tts indisponível" }), {
      status: 503,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store", ...CORS },
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        // Corta corpos absurdos antes de parsear: MAX_TEXT são 4000 chars, então
        // 64 KB cobre folgadamente texto + JSON + multibyte. Sem isto, um POST
        // de vários MB seria carregado em memória só para ser truncado depois.
        const declaredLength = Number(request.headers.get("content-length") ?? 0);
        if (declaredLength > MAX_BODY_BYTES) {
          return new Response(JSON.stringify({ error: "payload muito grande" }), {
            status: 413,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let text = "";
        let voice = "";
        try {
          const body = (await request.json()) as { text?: unknown; voice?: unknown };
          text = typeof body.text === "string" ? body.text.trim() : "";
          // `voice` é opcional; se vier fora do formato esperado, é ignorada
          // e o upstream usa a voz padrão dele.
          const v = typeof body.voice === "string" ? body.voice.trim() : "";
          voice = VOICE_RE.test(v) ? v : "";
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        if (!text) {
          return new Response(JSON.stringify({ error: "text obrigatório" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);

        try {
          const upstream = await fetch(TTS_UPSTREAM, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "audio/wav" },
            body: JSON.stringify(voice ? { text, voice } : { text }),
          });
          if (!upstream.ok) {
            return await fallbackTts(text);
          }
          const buf = await upstream.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "audio/wav",
              "Cache-Control": "no-store",
              ...CORS,
            },
          });
        } catch {
          return await fallbackTts(text);
        }
      },
    },
  },
});
