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

const TTS_UPSTREAM =
  process.env.TTS_UPSTREAM_URL ?? "https://server-mj.tailec426c.ts.net/api/tts";
const MAX_TEXT = 4000;

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
        let text = "";
        try {
          const body = (await request.json()) as { text?: unknown };
          text = typeof body.text === "string" ? body.text.trim() : "";
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
            body: JSON.stringify({ text }),
          });
          if (!upstream.ok) {
            const detail = await upstream.text().catch(() => "");
            return new Response(
              JSON.stringify({ error: "tts upstream failed", status: upstream.status, detail: detail.slice(0, 500) }),
              { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
            );
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
        } catch (err) {
          return new Response(
            JSON.stringify({ error: "tts upstream unreachable", detail: String(err).slice(0, 300) }),
            { status: 502, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});