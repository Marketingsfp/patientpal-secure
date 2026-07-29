import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM_BASE = "https://server-mj.tailec426c.ts.net";
const CANDIDATOS_LISTAGEM = ["/api/voices", "/voices", "/api/tts/voices"];
const FALLBACK = ["faber", "feminina"];

type CacheEntry = { at: number; vozes: string[]; origem: "servidor" | "fallback" };
let cache: CacheEntry | null = null;
const TTL_MS = 30_000;

function extrairVozes(payload: unknown): string[] | null {
  const walk = (v: unknown): string[] | null => {
    if (Array.isArray(v)) {
      const strs = v
        .map((x) =>
          typeof x === "string"
            ? x
            : x && typeof x === "object" && "name" in (x as Record<string, unknown>)
              ? String((x as Record<string, unknown>).name)
              : x && typeof x === "object" && "voice" in (x as Record<string, unknown>)
                ? String((x as Record<string, unknown>).voice)
                : null,
        )
        .filter((x): x is string => !!x && x.length > 0);
      return strs.length ? strs : null;
    }
    if (v && typeof v === "object") {
      for (const key of ["voices", "vozes", "data", "items", "models"]) {
        const inner = (v as Record<string, unknown>)[key];
        const r = walk(inner);
        if (r) return r;
      }
      const keys = Object.keys(v as Record<string, unknown>);
      if (keys.length && keys.every((k) => typeof k === "string")) return keys;
    }
    return null;
  };
  return walk(payload);
}

async function tentarListar(): Promise<string[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    for (const path of CANDIDATOS_LISTAGEM) {
      try {
        const r = await fetch(`${UPSTREAM_BASE}${path}`, { signal: ctrl.signal });
        if (!r.ok) continue;
        const ct = r.headers.get("Content-Type") ?? "";
        if (!ct.includes("json")) continue;
        const j = (await r.json()) as unknown;
        const vozes = extrairVozes(j);
        if (vozes && vozes.length) return Array.from(new Set(vozes));
      } catch {
        /* tenta a próxima */
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/tts-voices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const force = url.searchParams.get("refresh") === "1";
        const now = Date.now();
        if (!force && cache && now - cache.at < TTL_MS) {
          return Response.json({ ...cache, cached: true });
        }
        const vozes = await tentarListar();
        const resposta: CacheEntry = vozes
          ? { at: now, vozes, origem: "servidor" }
          : { at: now, vozes: FALLBACK, origem: "fallback" };
        cache = resposta;
        return Response.json({ ...resposta, cached: false });
      },
    },
  },
});