import { createFileRoute } from "@tanstack/react-router";

/**
 * Lista as vozes disponíveis no servidor Piper local.
 *
 * O servidor fica em rede privada (Tailscale) e não libera CORS para
 * *.lovable.app — por isso o backend consulta e devolve o catálogo já
 * normalizado, para alimentar o seletor de voz em Configurações → Voz.
 *
 * Não expomos a URL nem segredos do upstream: só nomes de voz.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

type Voz = { id: string; label: string };

function normalizar(payload: unknown): Voz[] {
  const push = (out: Map<string, Voz>, id: unknown, label?: unknown) => {
    if (typeof id !== "string") return;
    const key = id.trim();
    if (!key || !/^[a-z0-9_.\-]{1,64}$/i.test(key)) return;
    out.set(key, { id: key, label: typeof label === "string" && label.trim() ? label.trim() : key });
  };
  const out = new Map<string, Voz>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") push(out, item);
        else if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          push(out, o.id ?? o.name ?? o.voice ?? o.key, o.label ?? o.title ?? o.description);
        }
      }
      return;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of ["voices", "data", "models", "items", "result"]) {
        if (k in o) return walk(o[k]);
      }
      // objeto no formato { faber: {...}, feminina: {...} }
      for (const [k, val] of Object.entries(o)) {
        const lbl = val && typeof val === "object" ? (val as Record<string, unknown>).label : undefined;
        push(out, k, lbl);
      }
    }
  };
  walk(payload);
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export const Route = createFileRoute("/api/public/tts/voices")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const base =
          process.env["TTS_UPSTREAM_URL"] ?? "https://server-mj.tailec426c.ts.net/api/tts";
        const raiz = base.replace(/\/api\/tts\/?$/i, "").replace(/\/+$/, "");
        const candidatos = [
          process.env["TTS_VOICES_URL"],
          `${raiz}/api/voices`,
          `${raiz}/voices`,
          `${raiz}/api/tts/voices`,
        ].filter((u): u is string => !!u);

        for (const url of candidatos) {
          try {
            const res = await fetch(url, { headers: { Accept: "application/json" } });
            if (!res.ok) continue;
            const json = await res.json();
            const vozes = normalizar(json);
            if (vozes.length) {
              return new Response(JSON.stringify({ source: "piper", voices: vozes }), {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "public, max-age=60",
                  ...CORS,
                },
              });
            }
          } catch {
            // tenta o próximo candidato
          }
        }

        // Piper fora do ar: devolve o catálogo do fallback de IA.
        return new Response(
          JSON.stringify({
            source: "fallback",
            voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].map((v) => ({
              id: v,
              label: v,
            })),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
          },
        );
      },
    },
  },
});
