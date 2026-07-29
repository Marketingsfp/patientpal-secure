import { createFileRoute } from "@tanstack/react-router";

const UPSTREAM = "https://server-mj.tailec426c.ts.net/api/tts";

// Nomes conhecidos + comuns em vozes Piper pt-BR. Amplie livremente:
// qualquer voz que o servidor Piper aceitar aparecerá automaticamente na tela.
const CANDIDATOS = [
  "faber",
  "feminina",
  "cadu",
  "edresson",
  "jeff",
  "pirata",
  "leila",
  "julio",
  "brenda",
  "carlos",
  "ana",
  "bruno",
  "clara",
  "diana",
  "eva",
  "gabriel",
  "helena",
  "isabela",
  "joao",
  "luana",
  "maria",
  "pedro",
  "rafael",
  "sofia",
  "thiago",
  "vitoria",
];

type CacheEntry = { at: number; vozes: string[] };
let cache: CacheEntry | null = null;
const TTL_MS = 60_000;

async function probe(voice: string, signal: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: ".", voice }),
      signal,
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function detectar(extras: string[]): Promise<string[]> {
  const lista = Array.from(
    new Set([...CANDIDATOS, ...extras].map((v) => v.trim()).filter(Boolean)),
  );
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const results = await Promise.all(
      lista.map(async (v) => ((await probe(v, ctrl.signal)) ? v : null)),
    );
    return results.filter((v): v is string => !!v);
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
        const extras = (url.searchParams.get("extra") ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        const now = Date.now();
        if (!force && cache && now - cache.at < TTL_MS && extras.length === 0) {
          return Response.json({ vozes: cache.vozes, cached: true });
        }
        try {
          const vozes = await detectar(extras);
          if (extras.length === 0) cache = { at: now, vozes };
          return Response.json({ vozes, cached: false });
        } catch (err) {
          return Response.json(
            {
              vozes: [],
              error:
                err instanceof Error ? err.message : "Falha ao detectar vozes",
            },
            { status: 502 },
          );
        }
      },
    },
  },
});