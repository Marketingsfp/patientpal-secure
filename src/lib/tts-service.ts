/**
 * Serviço de Text-to-Speech (TTS) usando o backend de IA local Piper,
 * exposto via /api/public/tts (proxy). Uso apenas no cliente.
 *
 * Fluxo:
 *   1. POST { text } → /api/public/tts
 *   2. resposta = Blob audio/wav
 *   3. URL.createObjectURL + <audio>.play()
 *
 * Autoplay: navegadores modernos exigem interação prévia. Se o autoplay
 * for bloqueado, silenciosamente falha (o erro é logado no console).
 *
 * Habilitação: escopada por clínica (Menino Jesus) via useTts(), mas o
 * usuário pode desativar globalmente em localStorage["tts:enabled"] = "0".
 */

const PROXY_URL = "/api/public/tts";
const STORAGE_KEY = "tts:enabled";
const RATE_STORAGE_KEY = "tts:rate";
export const DEFAULT_TTS_RATE = 0.55;
export const MIN_TTS_RATE = 0.3;
export const MAX_TTS_RATE = 1.5;

/**
 * Evento disparado sempre que a configuração de TTS mudar (mesma aba).
 * Cross-tab é coberto pelo `storage` event nativo.
 */
export const TTS_CHANGED_EVENT = "tts:changed";

function emitTtsChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(TTS_CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

export function getUserTtsRate(): number {
  if (typeof window === "undefined") return DEFAULT_TTS_RATE;
  const raw = window.localStorage.getItem(RATE_STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_TTS_RATE;
  return Math.min(MAX_TTS_RATE, Math.max(MIN_TTS_RATE, n));
}

export function setUserTtsRate(rate: number) {
  if (typeof window === "undefined") return;
  const clamped = Math.min(MAX_TTS_RATE, Math.max(MIN_TTS_RATE, rate));
  window.localStorage.setItem(RATE_STORAGE_KEY, String(clamped));
  // Aplica ao áudio em reprodução, se houver, para refletir em tempo real.
  if (currentAudio) {
    try {
      currentAudio.playbackRate = clamped;
      (currentAudio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    } catch {
      /* noop */
    }
  }
  emitTtsChanged();
}

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
const cache = new Map<string, string>(); // text → objectUrl (LRU-lite, max 20)

export function isUserTtsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "0";
}

export function setUserTtsEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  if (!on) stopSpeaking();
  emitTtsChanged();
}

export function stopSpeaking() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
}

async function fetchAudioUrl(text: string): Promise<string> {
  const key = text.trim();
  const cached = cache.get(key);
  if (cached) return cached;
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: key }),
  });
  if (!res.ok) throw new Error(`TTS falhou: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  cache.set(key, url);
  if (cache.size > 20) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      const oldUrl = cache.get(oldest);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      cache.delete(oldest);
    }
  }
  return url;
}

export interface SpeakOptions {
  /** Interrompe qualquer fala em andamento antes de tocar. Padrão: true. */
  interrupt?: boolean;
  /** Callback ao terminar a fala com sucesso. */
  onEnd?: () => void;
  /** Callback em erro (rede/upstream/autoplay bloqueado). */
  onError?: (err: unknown) => void;
}

/** Reproduz `text` em voz alta usando o backend Piper. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const t = (text ?? "").trim();
  if (!t) return;
  if (!isUserTtsEnabled()) return;
  if (typeof window === "undefined") return;

  const { interrupt = true, onEnd, onError } = opts;
  if (interrupt) stopSpeaking();

  try {
    const url = await fetchAudioUrl(t);
    const audio = new Audio(url);
    audio.preload = "auto";
    // Velocidade configurável pelo usuário (mantém o pitch).
    audio.playbackRate = getUserTtsRate();
    // preservesPitch é padrão true em navegadores modernos; garante mesmo assim.
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    currentAudio = audio;
    currentUrl = url;
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      onEnd?.();
    };
    audio.onerror = (e) => {
      if (currentAudio === audio) currentAudio = null;
      onError?.(e);
    };
    await audio.play();
  } catch (err) {
    console.warn("[tts] falha ao reproduzir:", err);
    onError?.(err);
  }
}

/** True se há uma fala em andamento (útil para animar botão). */
export function isSpeaking(): boolean {
  return !!currentAudio && !currentAudio.paused;
}

/** Libera o objectURL atual (opcional). */
export function disposeCurrent() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  currentAudio = null;
}

// ---------------------------------------------------------------------------
// Sincronização em tempo real (mesma aba e cross-tab).
// Ao mudar a velocidade em qualquer aba, o áudio Piper que estiver tocando
// em outra aba (ex.: painel de chamadas) atualiza o playbackRate no ato.
// A habilitação (ligar/desligar) é aplicada interrompendo a fala em curso.
// ---------------------------------------------------------------------------
if (typeof window !== "undefined") {
  const applyLive = () => {
    if (!isUserTtsEnabled()) {
      stopSpeaking();
      return;
    }
    if (currentAudio) {
      try {
        currentAudio.playbackRate = getUserTtsRate();
        (currentAudio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      } catch {
        /* noop */
      }
    }
  };
  window.addEventListener("storage", (e) => {
    if (e.key === RATE_STORAGE_KEY || e.key === STORAGE_KEY) applyLive();
  });
  window.addEventListener(TTS_CHANGED_EVENT, applyLive);
}