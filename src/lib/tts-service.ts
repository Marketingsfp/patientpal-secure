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
const VOICE_STORAGE_KEY = "tts:voice";
const PIPER_VOICE_STORAGE_KEY = "tts:piperVoice";
const VOICES_URL = "/api/public/tts-voices";
/**
 * Velocidade padrão da voz do Piper. 1 = velocidade natural da gravação.
 *
 * Antes valia 0.55, o que deixava a locução arrastada em qualquer máquina que
 * nunca tivesse salvo uma preferência (painel/TV/totem novos). Como a fala do
 * Piper já sai pausada, o padrão correto é 1.
 */
export const DEFAULT_TTS_RATE = 1;

/** Valor do padrão antigo, que deixava a voz lenta. Migrado para 1 uma vez. */
const LEGACY_SLOW_RATE = 0.55;
export const MIN_TTS_RATE = 0.3;
export const MAX_TTS_RATE = 1.5;

/**
 * Velocidade padrão da voz DO NAVEGADOR quando não há nada salvo.
 *
 * Existe separada de `DEFAULT_TTS_RATE` porque o número significa coisas
 * diferentes nos dois motores. No Piper o valor vira `playbackRate` de um
 * áudio já gravado, então 0.55 deixa a locução bem arrastada — e era esse o
 * ajuste desejado. Na Web Speech API, `utterance.rate = 1` já é a velocidade
 * natural da voz, e 0.55 soa lento demais. 0.85 é o meio-termo: pausado o
 * suficiente para uma sala de espera, sem parecer câmera lenta.
 */
export const DEFAULT_NATIVE_TTS_RATE = 0.95;

/**
 * Valores especiais do seletor de voz.
 *
 * `AUTO` mantém o comportamento histórico (Piper na Menino Jesus, voz nativa
 * escolhida por heurística nas demais). `PIPER` força o servidor local.
 * Qualquer outro valor é o `voiceURI` de uma voz do próprio navegador.
 */
export const TTS_VOICE_AUTO = "auto";
export const TTS_VOICE_PIPER = "piper";

// ---------------------------------------------------------------------------
// Sincronização por clínica (fonte de verdade: tabela `clinica_tts_config`).
// O painel público da TV escuta esta tabela via Realtime para aplicar mudanças
// imediatamente ao salvar na tela de configuração — mesmo em outro navegador
// ou dispositivo. LocalStorage segue como cache/preferência local do usuário.
// ---------------------------------------------------------------------------
import { supabase } from "@/integrations/supabase/client";

export interface ClinicaTtsConfig {
  rate: number;
  enabled: boolean;
  /** Voz do servidor Piper (ex.: "pt_BR-faber-medium"). Vazio = padrão do servidor. */
  piperVoice?: string;
}

export interface PiperVoice {
  id: string;
  label: string;
}

/**
 * Catálogo de vozes do servidor Piper, via proxy do backend (o servidor fica
 * em rede privada e não libera CORS). Nunca lança: em falha devolve [].
 */
export async function fetchPiperVoices(): Promise<{ voices: PiperVoice[]; source: string }> {
  try {
    const res = await fetch(VOICES_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) return { voices: [], source: "erro" };
    const json = (await res.json()) as { voices?: PiperVoice[]; source?: string };
    return { voices: Array.isArray(json.voices) ? json.voices : [], source: json.source ?? "" };
  } catch {
    return { voices: [], source: "erro" };
  }
}

/** Voz do Piper escolhida (vazio = deixa o servidor usar o padrão dele). */
export function getPiperVoice(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(PIPER_VOICE_STORAGE_KEY) || "";
}

export function setPiperVoice(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PIPER_VOICE_STORAGE_KEY, value || "");
  // O cache de áudio é por texto; trocar a voz precisa invalidá-lo.
  limparCacheAudio();
  stopSpeaking();
  emitTtsChanged();
}

/** Aplica a config recebida no cache local e notifica todas as abas/hooks. */
export function applyClinicaTtsConfig(cfg: Partial<ClinicaTtsConfig>) {
  if (typeof window === "undefined") return;
  if (typeof cfg.rate === "number" && Number.isFinite(cfg.rate)) {
    // Normaliza aqui também: este é o caminho por onde o valor da clínica
    // chega do banco, e é onde uma porcentagem gravada por fora entraria.
    const clamped = normalizarRate(cfg.rate);
    window.localStorage.setItem(RATE_STORAGE_KEY, String(clamped));
    if (currentAudio) {
      try {
        currentAudio.playbackRate = clamped;
        (currentAudio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      } catch {
        /* noop */
      }
    }
  }
  if (typeof cfg.piperVoice === "string") {
    const anterior = window.localStorage.getItem(PIPER_VOICE_STORAGE_KEY) || "";
    if (anterior !== cfg.piperVoice) {
      window.localStorage.setItem(PIPER_VOICE_STORAGE_KEY, cfg.piperVoice);
      limparCacheAudio();
    }
  }
  if (typeof cfg.enabled === "boolean") {
    window.localStorage.setItem(STORAGE_KEY, cfg.enabled ? "1" : "0");
    if (!cfg.enabled) stopSpeaking();
  }
  emitTtsChanged();
}

/** Busca a configuração atual da clínica no banco. */
export async function fetchClinicaTtsConfig(clinicaId: string): Promise<ClinicaTtsConfig | null> {
  const { data, error } = await supabase
    .from("clinica_tts_config")
    .select("rate, enabled, piper_voice")
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    rate: Number(data.rate),
    enabled: !!data.enabled,
    piperVoice: (data as { piper_voice?: string | null }).piper_voice ?? "",
  };
}

/** Grava a configuração da clínica no banco (dispara Realtime). */
export async function saveClinicaTtsConfig(
  clinicaId: string,
  cfg: ClinicaTtsConfig,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("clinica_tts_config").upsert(
    {
      clinica_id: clinicaId,
      rate: cfg.rate,
      enabled: cfg.enabled,
      piper_voice: cfg.piperVoice ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clinica_id" },
  );
  return { error: error?.message ?? null };
}

/**
 * Escuta em tempo real a configuração de voz de uma clínica.
 * Sempre que houver INSERT/UPDATE, aplica localmente (cache + evento).
 * Retorna função para cancelar a inscrição.
 */
export function subscribeClinicaTtsConfig(clinicaId: string): () => void {
  // Primeiro carrega o estado atual (para sincronizar ao montar).
  void fetchClinicaTtsConfig(clinicaId).then((cfg) => {
    if (cfg) applyClinicaTtsConfig(cfg);
  });
  const ch = supabase
    .channel(`tts-config-${clinicaId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "clinica_tts_config",
        filter: `clinica_id=eq.${clinicaId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as {
          rate?: number;
          enabled?: boolean;
          piper_voice?: string | null;
        } | null;
        if (!row) return;
        applyClinicaTtsConfig({
          rate: typeof row.rate === "number" ? row.rate : Number(row.rate),
          enabled: row.enabled,
          piperVoice: row.piper_voice ?? "",
        });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

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

/**
 * Converte o número para o formato que os motores esperam: uma FRAÇÃO, onde
 * 1 é a velocidade natural.
 *
 * A tela grava fração (o slider já faz `valor / 100` antes de salvar), mas um
 * valor em porcentagem pode entrar por fora — alguém editando a tabela
 * `clinica_tts_config` na mão, ou uma integração futura gravando 85 em vez de
 * 0.85. Sem esta guarda, 85 seria apenas cortado no teto (1.5) e a chamada
 * sairia acelerada sem ninguém entender por quê.
 *
 * Por isso: qualquer valor acima do teto é interpretado como porcentagem e
 * dividido por 100. Depois disso, o clamp normal se aplica.
 */
function normalizarRate(n: number): number {
  const emFracao = n > MAX_TTS_RATE ? n / 100 : n;
  return Math.min(MAX_TTS_RATE, Math.max(MIN_TTS_RATE, emFracao));
}

export function getUserTtsRate(): number {
  if (typeof window === "undefined") return DEFAULT_TTS_RATE;
  const raw = window.localStorage.getItem(RATE_STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_TTS_RATE;
  return normalizarRate(n);
}

/** True se existe uma velocidade gravada (por este navegador ou pela clínica). */
function temRateSalvo(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(RATE_STORAGE_KEY);
  return !!raw && Number.isFinite(Number(raw));
}

/**
 * Velocidade a usar na voz do navegador: a configurada, ou
 * `DEFAULT_NATIVE_TTS_RATE` quando nunca se salvou nada nesta máquina.
 */
export function getNativeTtsRate(): number {
  if (!temRateSalvo()) return DEFAULT_NATIVE_TTS_RATE;
  return getUserTtsRate();
}

export function setUserTtsRate(rate: number) {
  if (typeof window === "undefined") return;
  const clamped = normalizarRate(rate);
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

// ---------------------------------------------------------------------------
// Voz do navegador (Web Speech API).
//
// Por que isto existe: quando o Windows está em inglês e não tem nenhum pacote
// de voz em português instalado, `getVoices()` não devolve nenhuma voz pt-BR.
// Nesse caso o código antigo deixava `utterance.voice` sem atribuir, e o
// navegador caía na voz padrão do sistema — americana. Definir só
// `utterance.lang = "pt-BR"` NÃO resolve: o idioma é uma dica, a voz é que
// manda no sotaque. Por isso agora dá para escolher a voz explicitamente.
//
// A preferência é por navegador (localStorage), e não por clínica no banco:
// a lista de vozes depende do sistema operacional de cada máquina, então o
// `voiceURI` escolhido no computador da recepção pode simplesmente não existir
// na TV do painel. Quando não existir, caímos na heurística de sempre.
// ---------------------------------------------------------------------------

/** True se o idioma da voz é português do Brasil (aceita pt-BR, pt_BR, ptBR). */
function ehPtBr(v: SpeechSynthesisVoice): boolean {
  return /pt(-|_)?BR/i.test(v.lang) || /portuguese.*brazil/i.test(v.name);
}

/**
 * Vozes oferecidas no seletor: só as de português do Brasil. Se a máquina não
 * tiver nenhuma, devolve todas — melhor deixar o usuário escolher uma voz
 * qualquer do que não oferecer opção nenhuma.
 */
export function listBrowserVoices(): { vozes: SpeechSynthesisVoice[]; temPtBr: boolean } {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { vozes: [], temPtBr: false };
  }
  const todas = window.speechSynthesis.getVoices();
  const ptBr = todas.filter(ehPtBr);
  return ptBr.length ? { vozes: ptBr, temPtBr: true } : { vozes: todas, temPtBr: false };
}

/**
 * True se existe ao menos uma voz pt-BR instalada NESTE navegador.
 *
 * Importa porque, sem nenhuma, não há o que atribuir a `utterance.voice`: o
 * navegador usa a voz padrão do sistema operacional e o português sai com
 * sotaque americano. Nesse caso é melhor falar pelo Piper do que falar errado.
 */
export function temVozPtBrInstalada(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.getVoices().some(ehPtBr);
}

/** Heurística histórica: prefere uma voz feminina pt-BR entre as disponíveis. */
function escolherVozPtBrPadrao(todas: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ptBR = todas.filter(ehPtBr);
  const candidatas = ptBR.length ? ptBR : todas.filter((v) => /^pt/i.test(v.lang));
  const nomesFemininos =
    /(luciana|maria|francisca|camila|helena|joana|vitoria|vitória|fernanda|paulina|google.*português|microsoft.*(maria|francisca|heloisa|helo[íi]sa)|female|feminina|mulher)/i;
  return candidatas.find((v) => nomesFemininos.test(v.name)) ?? candidatas[0] ?? null;
}

/** Preferência salva: `TTS_VOICE_AUTO`, `TTS_VOICE_PIPER` ou um `voiceURI`. */
export function getUserTtsVoice(): string {
  if (typeof window === "undefined") return TTS_VOICE_AUTO;
  return window.localStorage.getItem(VOICE_STORAGE_KEY) || TTS_VOICE_AUTO;
}

export function setUserTtsVoice(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOICE_STORAGE_KEY, value || TTS_VOICE_AUTO);
  stopSpeaking();
  emitTtsChanged();
}

/** True se o usuário pediu explicitamente o servidor Piper. */
export function usuarioPreferePiper(): boolean {
  return getUserTtsVoice() === TTS_VOICE_PIPER;
}

/** True se o usuário escolheu uma voz do próprio navegador. */
export function usuarioPrefereVozDoNavegador(): boolean {
  const v = getUserTtsVoice();
  return v !== TTS_VOICE_AUTO && v !== TTS_VOICE_PIPER;
}

/**
 * Resolve a voz que deve ser usada agora. Tenta o `voiceURI` salvo; se aquela
 * voz não existir nesta máquina, cai no nome e depois na heurística pt-BR.
 */
export function resolveBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const todas = window.speechSynthesis.getVoices();
  if (!todas.length) return null;
  const pref = getUserTtsVoice();
  if (pref !== TTS_VOICE_AUTO && pref !== TTS_VOICE_PIPER) {
    const exata = todas.find((v) => v.voiceURI === pref) ?? todas.find((v) => v.name === pref);
    if (exata) return exata;
  }
  return escolherVozPtBrPadrao(todas);
}

/**
 * Cria a fala do navegador já com idioma, voz e velocidade corretos.
 *
 * Todo `SpeechSynthesisUtterance` do sistema deve nascer aqui — é o que
 * garante que nenhum ponto do código volte a falar português com voz gringa.
 */
export function createUtterance(text: string): SpeechSynthesisUtterance {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "pt-BR";
  utter.rate = getNativeTtsRate();
  const voz = resolveBrowserVoice();
  if (voz) utter.voice = voz;
  return utter;
}

/** Fala usando a Web Speech API do navegador (sem passar pelo Piper). */
function speakNative(text: string, opts: SpeakOptions = {}): Promise<void> {
  const { interrupt = true, onEnd, onError } = opts;
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onError?.(new Error("Este navegador não tem síntese de voz."));
      resolve();
      return;
    }
    if (interrupt) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    }
    const utter = createUtterance(text);
    utter.onend = () => {
      onEnd?.();
      resolve();
    };
    utter.onerror = (e) => {
      onError?.(e);
      resolve();
    };
    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utter);
    } catch (err) {
      onError?.(err);
      resolve();
    }
  });
}

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
const cache = new Map<string, string>(); // text → objectUrl (LRU-lite, max 20)

/** Descarta os áudios em cache (usado ao trocar a voz do Piper). */
function limparCacheAudio() {
  for (const url of cache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  }
  cache.clear();
}

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
  // A fala pode estar vindo da Web Speech API (voz do navegador) em vez do
  // Piper — parar só o <audio> deixaria a voz nativa falando sozinha.
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

async function fetchAudioUrl(text: string): Promise<string> {
  const voice = getPiperVoice();
  const key = `${voice}|${text.trim()}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(voice ? { text: text.trim(), voice } : { text: text.trim() }),
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

/**
 * Reproduz `text` em voz alta.
 *
 * Se o usuário escolheu uma voz do próprio navegador na tela de Voz & Áudio,
 * usa a Web Speech API; caso contrário usa o backend Piper (comportamento
 * histórico). Assim o seletor de voz vale para todas as telas de uma vez —
 * painel de senhas, alertas e leitura de anamnese.
 */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const t = (text ?? "").trim();
  if (!t) return;
  if (!isUserTtsEnabled()) return;
  if (typeof window === "undefined") return;

  if (usuarioPrefereVozDoNavegador()) {
    return speakNative(t, opts);
  }

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
  // Migração única: quem tinha o padrão antigo (0.55) gravado no navegador
  // continuava ouvindo a voz arrastada mesmo depois da correção do padrão.
  try {
    const MIGRATED_KEY = "tts:rate:migrado-1";
    if (!window.localStorage.getItem(MIGRATED_KEY)) {
      const atual = Number(window.localStorage.getItem(RATE_STORAGE_KEY));
      if (Number.isFinite(atual) && Math.abs(atual - LEGACY_SLOW_RATE) < 0.001) {
        window.localStorage.setItem(RATE_STORAGE_KEY, String(DEFAULT_TTS_RATE));
      }
      window.localStorage.setItem(MIGRATED_KEY, "1");
    }
  } catch {
    /* noop */
  }

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
