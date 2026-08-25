/**
 * Voz da Nina (leitura em voz alta das respostas do chat).
 *
 * Usa o motor de voz do sistema (Piper) quando o TTS global está ligado; se
 * estiver desligado ou o servidor não responder, cai na voz nativa do
 * navegador para que o chat sempre consiga falar.
 *
 * A preferência é local (localStorage "nina:voz") e independe do toggle global.
 */
import { isUserTtsEnabled, speak, stopSpeaking } from "@/lib/tts-service";

const KEY = "nina:voz";

export function isNinaVozOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setNinaVozOn(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* noop */
  }
}

/** Remove marcações de Markdown para a fala não soar cheia de símbolos. */
export function limparParaFala(texto: string): string {
  return (texto ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~#>|]/g, " ")
    .replace(/^\s*[-+]\s+/gm, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function falarNativo(texto: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "pt-BR";
      u.rate = 1.05;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

/** Lê o texto em voz alta, com fallback para a voz do navegador. */
export async function falarNina(texto: string) {
  const t = limparParaFala(texto).slice(0, 1200);
  if (!t) return;
  if (!isUserTtsEnabled()) {
    await falarNativo(t);
    return;
  }
  let falhou = false;
  await speak(t, { onError: () => (falhou = true) });
  if (falhou) await falarNativo(t);
}


export function pararNina() {
  stopSpeaking();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}
