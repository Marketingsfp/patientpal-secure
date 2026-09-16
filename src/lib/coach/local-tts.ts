// TTS local (Piper / Coqui XTTS via HTTP) — chamado direto do navegador.
// O servidor local não é acessível pelo backend, então a requisição sai do cliente.

const CFG_KEY = "coach_wa_local_tts_v3";

export type LocalTtsConfig = {
  enabled: boolean;
  url: string;
  voice: string;
};

export const DEFAULT_LOCAL_TTS: LocalTtsConfig = {
  enabled: true,
  url: "https://server-mj.tailec426c.ts.net/api/tts",
  voice: "pt_BR-luciana",
};

/** Vozes Piper: masculina (faber) e feminina (dii). */
export const VOZ_MASCULINA = "pt_BR-faber-medium";
export const VOZ_FEMININA = "dii_pt-BR";

/**
 * O Piper gera a fala um pouco arrastada; 1.15x deixa no ritmo
 * natural de uma conversa por telefone.
 */
export const TTS_PLAYBACK_RATE = 1.15;

const NOMES_MASCULINOS = [
  "joao","joão","rafael","carlos","pedro","lucas","marcos","paulo","jose","josé",
  "andre","andré","bruno","thiago","tiago","felipe","gustavo","daniel","eduardo",
  "fernando","ricardo","roberto","rodrigo","sergio","sérgio","vitor","victor",
  "matheus","mateus","gabriel","leonardo","luiz","luis","luís","antonio","antônio",
  "batista","alexandre","diego","igor","murilo","otavio","otávio","renato","samuel",
];
const NOMES_FEMININOS_EXCECAO = [
  "beatriz","ines","inês","raquel","rachel","ester","esther","carmen","eliane",
  "elen","helen","kettlen","yasmin","karen","cristiane","jessica","jéssica","nathalia",
];

/** Decide a voz (masculina/feminina) a partir do nome do personagem. */
export function vozPorNome(nomeCompleto: string): string {
  const limpo = nomeCompleto
    .replace(/paciente|cliente|·|\-|\|/gi, " ")
    .trim()
    .toLowerCase();
  const primeiro = limpo.split(/\s+/)[0] ?? "";
  if (!primeiro) return VOZ_FEMININA;
  if (NOMES_MASCULINOS.includes(primeiro)) return VOZ_MASCULINA;
  if (NOMES_FEMININOS_EXCECAO.includes(primeiro)) return VOZ_FEMININA;
  if (/(a|ia|ana|ne|ce)$/.test(primeiro)) return VOZ_FEMININA;
  return VOZ_MASCULINA;
}

export function loadLocalTts(): LocalTtsConfig {
  if (typeof window === "undefined") return DEFAULT_LOCAL_TTS;
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    if (!raw) return DEFAULT_LOCAL_TTS;
    const parsed = JSON.parse(raw) as Partial<LocalTtsConfig>;
    return { ...DEFAULT_LOCAL_TTS, ...parsed };
  } catch {
    return DEFAULT_LOCAL_TTS;
  }
}

export function saveLocalTts(cfg: LocalTtsConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

/**
 * URL direta de GET para tocar no <audio> sem fetch.
 * Serve como plano B quando o servidor local não envia cabeçalhos CORS
 * (o elemento <audio> não exige CORS para tocar mídia).
 */
export function buildLocalTtsUrl(text: string, cfg: LocalTtsConfig): string {
  const base = cfg.url.trim().replace(/\/+$/, "");
  const voice = cfg.voice.trim();
  const qs = new URLSearchParams({ text });
  if (voice) {
    qs.set("speaker_id", voice);
    qs.set("voice", voice);
  }
  return `${base}?${qs.toString()}`;
}

async function tryFetch(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size < 256) throw new Error("resposta de áudio vazia");
  return blob;
}

/**
 * Busca o áudio no TTS local. Tenta os formatos mais comuns:
 * 1) POST JSON { text, voice, speaker }  (Piper HTTP, wrappers FastAPI)
 * 2) POST text/plain com o texto cru      (piper-http padrão)
 * 3) GET ?text=...&speaker_id=...         (Coqui TTS server)
 */
export async function fetchLocalTtsAudio(
  text: string,
  cfg: LocalTtsConfig,
  signal?: AbortSignal,
): Promise<Blob> {
  const base = cfg.url.trim().replace(/\/+$/, "");
  const voice = cfg.voice.trim();
  const errors: string[] = [];

  const attempts: Array<() => Promise<Blob>> = [
    () =>
      tryFetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: voice || undefined,
          speaker: voice || undefined,
          speaker_id: voice || undefined,
          language: "pt-br",
          language_id: "pt",
        }),
        signal,
      }),
    () =>
      tryFetch(base, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
        signal,
      }),
    () => {
      const qs = new URLSearchParams({ text });
      if (voice) {
        qs.set("speaker_id", voice);
        qs.set("voice", voice);
      }
      return tryFetch(`${base}?${qs.toString()}`, { method: "GET", signal });
    },
  ];

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      if (signal?.aborted) throw e;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(`TTS local falhou (${errors.join(" | ")})`);
}

export type TtsStatus = "checando" | "online" | "offline";

/**
 * Testa o servidor de voz local com uma frase curta.
 * Serve para mostrar o status na tela antes de a atendente iniciar a ligação.
 */
export async function pingLocalTts(cfg: LocalTtsConfig, timeoutMs = 6000): Promise<boolean> {
  if (!cfg.enabled || !cfg.url.trim()) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetchLocalTtsAudio("Olá", cfg, ctrl.signal);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
