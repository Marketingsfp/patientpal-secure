import { createFileRoute } from "@tanstack/react-router";

/**
 * Catálogo de vozes do servidor Piper local.
 *
 * O servidor fica em rede privada (Tailscale) e não libera CORS para o
 * navegador; aqui o backend consulta e devolve apenas os IDs das vozes.
 * Nenhuma credencial ou URL interna é exposta.
 *
 * Se o Piper estiver fora do ar, devolvemos o catálogo do fallback de IA
 * (OpenAI) para a tela não ficar vazia.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

const FALLBACK_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const VOICE_RE = /^[a-z0-9_-]{1,32}$/i;

/** Deriva um rótulo legível a partir do ID técnico da voz. */
function rotular(id: string): string {
  const semIdioma = id.replace(/^pt_BR-/i, "").replace(/_pt-BR$/i, "");
  const base = semIdioma.replace(/-(medium|low|high|x_low)$/i, "");
  const nome = base.replace(/_\d+$/, "").replace(/[_-]+/g, " ").trim();
  const bonito = nome.charAt(0).toUpperCase() + nome.slice(1);
  const qualidade = /-(medium|low|high|x_low)$/i.exec(semIdioma)?.[1];
  return qualidade ? `${bonito} (${qualidade.toLowerCase()})` : bonito;
}

function normalizar(payload: unknown): string[] {
  const bruto = Array.isArray(payload)
    ? payload
    : ((payload as { voices?: unknown } | null)?.voices ?? []);
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((v) =>
      typeof v === "string"
        ? v
        : typeof (v as { id?: unknown })?.id === "string"
          ? ((v as { id: string }).id)
          : typeof (v as { name?: unknown })?.name === "string"
            ? ((v as { name: string }).name)
            : "",
    )
    .map((s) => s.trim())
    .filter((s) => VOICE_RE.test(s));
}

export const Route = createFileRoute("/api/public/tts-voices")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const base = (
          process.env["TTS_UPSTREAM_URL"] ?? "https://server-mj.tailec426c.ts.net/api/tts"
        ).replace(/\/tts\/?$/, "");
        let ids: string[] = [];
        let fonte: "piper" | "fallback" = "piper";
        try {
          const res = await fetch(`${base}/voices`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) ids = normalizar(await res.json());
        } catch {
          /* servidor offline — cai no fallback abaixo */
        }
        if (!ids.length) {
          ids = FALLBACK_VOICES;
          fonte = "fallback";
        }
        return new Response(
          JSON.stringify({
            source: fonte,
            voices: ids.map((id) => ({ id, label: rotular(id) })),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=300",
              ...CORS,
            },
          },
        );
      },
    },
  },
});
