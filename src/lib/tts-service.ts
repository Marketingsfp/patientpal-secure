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