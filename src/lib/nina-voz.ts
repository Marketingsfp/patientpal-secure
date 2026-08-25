/**
 * Voz da Nina (leitura em voz alta das respostas do chat).
 *
 * Usa o TTS do Gemini (Lovable AI) em streaming: o áudio começa a tocar nos
 * primeiros pedaços que chegam, então a Nina responde praticamente sem espera.
 * Se o servidor de voz não responder, cai na voz nativa do navegador para o
 * chat nunca ficar mudo.
 *
 * A preferência é local (localStorage "nina:voz") e independe do toggle global.
 */

const KEY = "nina:voz";
/** PCM cru devolvido pelo Gemini: 24 kHz, 16 bits, mono. */
const SAMPLE_RATE = 24000;

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

// Contexto de áudio reaproveitado entre falas — criar um novo a cada resposta
// custa tempo e o navegador limita a quantidade de contextos abertos.
let ctx: AudioContext | null = null;
let fontes: AudioBufferSourceNode[] = [];
let abortar: AbortController | null = null;

function pegarContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx || ctx.state === "closed") ctx = new AC({ sampleRate: SAMPLE_RATE });
  return ctx;
}

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Fala com o Gemini, tocando o áudio em streaming.
 * Devolve `false` quando não deu (sem áudio, erro de rede, sem suporte), para
 * quem chamou cair na voz do navegador.
 */
async function falarGemini(texto: string): Promise<boolean> {
  const audio = pegarContexto();
  if (!audio) return false;
  if (audio.state === "suspended") await audio.resume().catch(() => {});

  abortar = new AbortController();
  const sinal = abortar.signal;
  let tocouAlgo = false;
  let cursor = 0; // momento (em segundos do contexto) do próximo pedaço
  let sobra = new Uint8Array(0); // amostra partida entre dois pedaços

  const tocar = (chegando: Uint8Array) => {
    const bytes = new Uint8Array(sobra.length + chegando.length);
    bytes.set(sobra);
    bytes.set(chegando, sobra.length);
    const usaveis = bytes.length - (bytes.length % 2);
    sobra = bytes.slice(usaveis);
    if (!usaveis) return;
    const amostras = new Int16Array(bytes.buffer, 0, usaveis / 2);
    const floats = Float32Array.from(amostras, (s) => s / 32768);
    const buffer = audio.createBuffer(1, floats.length, SAMPLE_RATE);
    buffer.copyToChannel(floats, 0);
    const fonte = audio.createBufferSource();
    fonte.buffer = buffer;
    fonte.connect(audio.destination);
    // 50 ms de folga no primeiro pedaço: agendar exatamente em currentTime
    // corta o começo da frase.
    cursor = cursor === 0 ? audio.currentTime + 0.05 : Math.max(cursor, audio.currentTime);
    fonte.start(cursor);
    cursor += buffer.duration;
    fontes.push(fonte);
    fonte.onended = () => {
      fontes = fontes.filter((f) => f !== fonte);
    };
    tocouAlgo = true;
  };

  try {
    const res = await fetch("/api/nina-voz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto }),
      signal: sinal,
    });
    if (!res.ok || !res.body) return false;

    const leitor = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      buffer += value;
      const linhas = buffer.split("\n");
      buffer = linhas.pop() ?? "";
      for (const linha of linhas) {
        if (!linha.startsWith("data:")) continue;
        const bruto = linha.slice(5).trim();
        if (!bruto || bruto === "[DONE]") continue;
        try {
          const evento = JSON.parse(bruto) as { type?: string; audio?: string };
          if (evento.type === "speech.audio.delta" && evento.audio) {
            tocar(base64ParaBytes(evento.audio));
          }
        } catch {
          /* linha parcial ou evento desconhecido */
        }
      }
    }
  } catch {
    return tocouAlgo;
  }

  if (!tocouAlgo) return false;
  // Espera a fala terminar para o microfone só voltar depois dela.
  const restante = Math.max(0, cursor - audio.currentTime);
  await new Promise((r) => setTimeout(r, restante * 1000));
  return true;
}

/** Lê o texto em voz alta (Gemini), com fallback para a voz do navegador. */
export async function falarNina(texto: string) {
  const t = limparParaFala(texto).slice(0, 1200);
  if (!t) return;
  pararNina();
  const ok = await falarGemini(t);
  if (!ok) await falarNativo(t);
}

export function pararNina() {
  abortar?.abort();
  abortar = null;
  for (const f of fontes) {
    try {
      f.stop();
    } catch {
      /* já terminou */
    }
  }
  fontes = [];
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}
