import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Streaming proxy para o TTS local (Piper / Coqui) do usuário.
// O navegador aponta um <audio src> aqui e recebe o WAV direto, sem CORS.
const ALLOWED_HOST_SUFFIX = [".ts.net", ".tailscale.net"];

function allowed(target: URL) {
  if (target.protocol !== "https:" && target.protocol !== "http:") return false;
  return ALLOWED_HOST_SUFFIX.some((s) => target.hostname.endsWith(s));
}

/** Exige um usuário autenticado — a rota gasta créditos de IA. */
async function autorizado(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return false;

  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return false;

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.auth.getClaims(token);
    return !error && !!data?.claims?.sub;
  } catch {
    return false;
  }
}

async function handle(request: Request) {
  if (!(await autorizado(request))) {
    return new Response("Não autorizado", { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  let raw = params.get("url") || "";
  let text = params.get("text") || "";
  let voice = params.get("voice") || "";
  // Voz Gemini escolhida no painel admin (ex.: Aoede, Puck)
  let vozGeminiParam = params.get("vozgemini") || "";
  // Motor escolhido no painel admin: auto | piper | gemini | openai
  let provedor = (params.get("provedor") || "auto").toLowerCase();

  // Aceita também corpo JSON: { text, voice, url }
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        const body = (await request.json()) as {
          text?: string;
          voice?: string;
          url?: string;
          provedor?: string;
          vozgemini?: string;
        };
        text = body.text ?? text;
        voice = body.voice ?? voice;
        raw = body.url ?? raw;
        vozGeminiParam = body.vozgemini ?? vozGeminiParam;
        provedor = (body.provedor ?? provedor).toLowerCase();
      } catch {
        // ignora corpo inválido
      }
    }
  }

  raw = raw || process.env["TTS_UPSTREAM_URL"] || "";
  text = text.slice(0, 4000);
  if (voice && !/^[a-z0-9_-]{1,32}$/i.test(voice)) voice = "";
  if (!["auto", "piper", "gemini", "openai"].includes(provedor)) provedor = "auto";

  // Modo diagnóstico: só verifica se o servidor local responde.
  if (params.get("probe")) {
    let t: URL;
    try {
      t = new URL(raw);
    } catch {
      return Response.json({ ok: false, motivo: "URL inválida" }, { status: 200 });
    }
    if (!allowed(t)) return Response.json({ ok: false, motivo: "Host não permitido" });
    try {
      const u = new URL(t.toString());
      u.searchParams.set("text", "teste");
      if (voice) u.searchParams.set("voice", voice);
      const res = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
      return Response.json({
        ok: res.ok,
        status: res.status,
        motivo: res.ok
          ? "Servidor respondeu"
          : res.status === 502 || res.status === 503
            ? "O túnel está online, mas o programa de TTS (Piper/Coqui) não está rodando na sua máquina"
            : `HTTP ${res.status}`,
      });
    } catch (e) {
      return Response.json({
        ok: false,
        motivo: e instanceof Error ? e.message : "sem resposta",
      });
    }
  }

  if (!text.trim()) return new Response("Parâmetros inválidos", { status: 400 });

  let target: URL | null = null;
  if (raw) {
    try {
      const t = new URL(raw);
      if (allowed(t)) target = t;
    } catch {
      target = null;
    }
  }

  const usaPiper = provedor === "auto" || provedor === "piper";
  const attempts: Array<() => Promise<Response>> = target && usaPiper
    ? [
        () =>
          fetch(target!.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              voice: voice || undefined,
              language: "pt-br",
            }),
            signal: AbortSignal.timeout(8000),
          }),
        () => {
          const u = new URL(target!.toString());
          u.searchParams.set("text", text);
          if (voice) {
            u.searchParams.set("voice", voice);
            u.searchParams.set("speaker_id", voice);
          }
          return fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
        },
      ]
    : [];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 256) throw new Error("áudio vazio");
      const ct = res.headers.get("content-type") || "";
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": ct.startsWith("audio") ? ct : "audio/wav",
          "Content-Length": String(buf.byteLength),
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Piper fora do ar: gera a voz pela IA da plataforma para o
  // treinamento nunca ficar sem áudio. Primeiro a voz Gemini (mais natural,
  // pt-BR), depois OpenAI como último recurso.
  const apiKey = process.env["LOVABLE_API_KEY"];
  const masculina = /faber|edresson|puck|charon|fenrir|male|masc/i.test(voice);
  // Voz Gemini escolhida no painel admin (quando enviada).
  const vozGemini = /^[A-Za-z]{2,20}$/.test(vozGeminiParam)
    ? vozGeminiParam
    : masculina
      ? "Puck"
      : "Aoede";

  const iaTentativas: Array<{ nome: string; body: Record<string, unknown> }> = [
    {
      nome: "gemini",
      body: {
        model: "google/gemini-2.5-flash-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Fale em português do Brasil, com tom simpático e natural de atendimento por telefone: ${text}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: vozGemini } },
          },
        },
      },
    },
    {
      nome: "openai",
      body: {
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice: masculina ? "onyx" : "alloy",
        response_format: "wav",
      },
    },
  ];

  const iaFiltradas =
    provedor === "piper"
      ? []
      : provedor === "gemini"
        ? iaTentativas.filter((t) => t.nome === "gemini")
        : provedor === "openai"
          ? iaTentativas.filter((t) => t.nome === "openai")
          : iaTentativas;

  if (apiKey) {
    for (const tentativa of iaFiltradas) {
      try {
        const ai = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(tentativa.body),
        });
        if (!ai.ok) throw new Error(`${tentativa.nome} HTTP ${ai.status}: ${(await ai.text()).slice(0, 160)}`);
        const buf = await ai.arrayBuffer();
        if (buf.byteLength < 256) throw new Error(`áudio ${tentativa.nome} vazio`);
        const ct = ai.headers.get("content-type") || "";
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": ct.startsWith("audio") ? ct : "audio/wav",
            "Content-Length": String(buf.byteLength),
            "Cache-Control": "no-store",
            "X-Tts-Source": tentativa.nome,
          },
        });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Sem Piper e sem IA: 204 para o cliente cair na voz do navegador.
  return new Response(null, {
    status: 204,
    headers: {
      "X-Tts-Error": errors.join(" | ").slice(0, 200).replace(/[^\x20-\x7e]/g, ""),
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/coach/tts")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});