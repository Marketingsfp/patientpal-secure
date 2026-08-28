import { createFileRoute } from "@tanstack/react-router";

/**
 * Voz da Nina com o TTS do Gemini (Lovable AI).
 *
 * Devolve o stream SSE do gateway sem alterar nada, para o navegador começar a
 * tocar já nos primeiros pedaços de áudio — é isso que faz a resposta sair
 * rápido, em vez de esperar o arquivo inteiro ficar pronto.
 *
 * Só o texto a ser falado passa por aqui. A rota fica fora de /api/public, ou
 * seja, exige a autenticação do site.
 */

const MAX_TEXT = 2000;
/** Voz feminina do catálogo Gemini — combina com a persona da Nina. */
const VOZ = "Leda";

export const Route = createFileRoute("/api/nina-voz")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return new Response(JSON.stringify({ error: "voz indisponível" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        let texto = "";
        try {
          const body = (await request.json()) as { text?: unknown };
          if (typeof body.text === "string") texto = body.text.trim().slice(0, MAX_TEXT);
        } catch {
          texto = "";
        }
        if (!texto) {
          return new Response(JSON.stringify({ error: "texto obrigatório" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-tts-preview",
            stream_format: "sse",
            contents: [
              {
                role: "user",
                parts: [{ text: `Fale em português do Brasil, natural e cordial: ${texto}` }],
              },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } },
            },
          }),
        });

        if (!res.ok || !res.body) {
          const detalhe = await res.text().catch(() => "");
          console.error("Gemini TTS falhou", res.status, detalhe);
          return new Response(JSON.stringify({ error: `voz indisponível (${res.status})` }), {
            status: res.status === 429 || res.status === 402 ? res.status : 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(res.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
