import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM = "https://server-mj.tailec426c.ts.net/api/tts";

export const Route = createFileRoute("/api/tts-proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.text();
          const upstream = await fetch(UPSTREAM, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          if (!upstream.ok) {
            return new Response(
              JSON.stringify({ error: `Upstream ${upstream.status}` }),
              { status: 502, headers: { "Content-Type": "application/json" } },
            );
          }
          const buf = await upstream.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type":
                upstream.headers.get("Content-Type") ?? "audio/wav",
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({
              error:
                err instanceof Error ? err.message : "Falha ao contatar TTS",
            }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});