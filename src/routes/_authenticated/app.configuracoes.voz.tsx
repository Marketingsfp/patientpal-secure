import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Volume2, Play, Square, RotateCcw, Save, Headphones, Loader2, Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClinica } from "@/hooks/use-clinica";
import { setClinicFeatureFlag, useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { FLAG_NINA_DESATIVADA, useNinaDesativada } from "@/hooks/use-nina-desativada";
import {
  DEFAULT_TTS_RATE,
  MAX_TTS_RATE,
  MIN_TTS_RATE,
  TTS_VOICE_AUTO,
  TTS_VOICE_PIPER,
  getUserTtsRate,
  setUserTtsRate,
  isUserTtsEnabled,
  setUserTtsEnabled,
  getUserTtsVoice,
  setUserTtsVoice,
  listBrowserVoices,
  speak,
  stopSpeaking,
  fetchPiperVoices,
  getPiperVoice,
  setPiperVoice,
  type PiperVoice,
  fetchClinicaTtsConfig,
  saveClinicaTtsConfig,
  applyClinicaTtsConfig,
} from "@/lib/tts-service";

export const Route = createFileRoute("/_authenticated/app/configuracoes/voz")({
  component: VozConfigPage,
  head: () => ({
    meta: [
      { title: "Voz & Áudio (TTS) — ClinicaOS" },
      {
        name: "description",
        content:
          "Configure a velocidade da síntese de voz (Piper) usada no painel de senhas, alertas e anamnese.",
      },
    ],
  }),
});

const FRASE_PADRAO = "Senha número 27, guichê 3. Boa tarde, dirija-se ao atendimento.";

function VozConfigPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const [rate, setRate] = useState<number>(DEFAULT_TTS_RATE);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [savedRate, setSavedRate] = useState<number>(DEFAULT_TTS_RATE);
  const [savedEnabled, setSavedEnabled] = useState<boolean>(true);
  const [voz, setVoz] = useState<string>(TTS_VOICE_AUTO);
  const [savedVoz, setSavedVoz] = useState<string>(TTS_VOICE_AUTO);
  const [vozes, setVozes] = useState<SpeechSynthesisVoice[]>([]);
  const [piperVozes, setPiperVozes] = useState<PiperVoice[]>([]);
  const [piperFonte, setPiperFonte] = useState<string>("");
  const [piperVoz, setPiperVoz] = useState<string>("");
  const [savedPiperVoz, setSavedPiperVoz] = useState<string>("");
  const [temPtBr, setTemPtBr] = useState<boolean>(true);
  const [texto, setTexto] = useState<string>(FRASE_PADRAO);
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // A lista de vozes do navegador chega de forma assíncrona: no Chrome a
  // primeira chamada a getVoices() costuma vir vazia e só depois dispara
  // "voiceschanged". Por isso recarregamos no evento também.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const carregar = () => {
      const { vozes: lista, temPtBr: achouPtBr } = listBrowserVoices();
      setVozes(lista);
      setTemPtBr(achouPtBr);
    };
    carregar();
    window.speechSynthesis.addEventListener?.("voiceschanged", carregar);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", carregar);
    };
  }, []);

  // Catálogo real do servidor Piper (via proxy do backend).
  useEffect(() => {
    let cancelado = false;
    void fetchPiperVoices().then(({ voices, source }) => {
      if (cancelado) return;
      setPiperVozes(voices);
      setPiperFonte(source);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    // Fonte de verdade: banco por clínica (para propagar em Realtime ao
    // painel). Se não houver linha ainda, usa o cache local como fallback.
    let cancelado = false;
    (async () => {
      let r = getUserTtsRate();
      let e = isUserTtsEnabled();
      let pv = getPiperVoice();
      if (clinicaId) {
        const cfg = await fetchClinicaTtsConfig(clinicaId);
        if (cfg) {
          r = cfg.rate;
          e = cfg.enabled;
          pv = cfg.piperVoice ?? "";
          applyClinicaTtsConfig(cfg);
        }
      }
      if (cancelado) return;
      setRate(r);
      setSavedRate(r);
      setEnabled(e);
      setSavedEnabled(e);
      setPiperVoz(pv);
      setSavedPiperVoz(pv);
      // A voz NÃO vem do banco: a lista depende do sistema operacional de
      // cada máquina, então a preferência é sempre deste navegador.
      const v = getUserTtsVoice();
      setVoz(v);
      setSavedVoz(v);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId]);

  function alterarRate(next: number) {
    const clamped = Math.min(MAX_TTS_RATE, Math.max(MIN_TTS_RATE, next));
    setRate(clamped);
  }

  function alterarEnabled(on: boolean) {
    setEnabled(on);
    if (!on) stopSpeaking();
  }

  async function salvar() {
    setSalvando(true);
    try {
      // Cache local + evento (aplica na mesma aba imediatamente).
      setUserTtsRate(rate);
      setUserTtsEnabled(enabled);
      setUserTtsVoice(voz);
      setPiperVoice(piperVoz);
      // Fonte de verdade compartilhada com o painel (Realtime).
      if (clinicaId) {
        const { error } = await saveClinicaTtsConfig(clinicaId, {
          rate,
          enabled,
          piperVoice: piperVoz,
        });
        if (error) {
          toast.error(`Falha ao sincronizar com o painel: ${error}`);
          return;
        }
      }
      setSavedRate(rate);
      setSavedEnabled(enabled);
      setSavedVoz(voz);
      setSavedPiperVoz(piperVoz);
      toast.success(
        clinicaId
          ? `Preferências salvas (${Math.round(rate * 100)}%) — painel atualizado.`
          : `Preferências salvas (${Math.round(rate * 100)}%).`,
      );
    } finally {
      setSalvando(false);
    }
  }

  function descartar() {
    setRate(savedRate);
    setEnabled(savedEnabled);
    setVoz(savedVoz);
    setPiperVoz(savedPiperVoz);
  }

  /** Volta velocidade e voz ao que está salvo (o teste aplica em caráter temporário). */
  function restaurarSalvos() {
    setUserTtsRate(savedRate);
    setUserTtsVoice(savedVoz);
    setPiperVoice(savedPiperVoz);
  }

  async function testar() {
    if (!enabled) {
      toast.warning("Ative a voz antes de testar.");
      return;
    }
    // Aplica temporariamente a velocidade e a voz em edição só para o teste,
    // sem persistir — o Salvar continua responsável por gravar.
    setUserTtsRate(rate);
    setUserTtsVoice(voz);
    setPiperVoice(piperVoz);
    setTestando(true);
    try {
      await speak(texto || FRASE_PADRAO, {
        onEnd: () => {
          setTestando(false);
          restaurarSalvos();
        },
        onError: () => {
          setTestando(false);
          restaurarSalvos();
          toast.error(
            voz === TTS_VOICE_PIPER || voz === TTS_VOICE_AUTO
              ? "Falha ao reproduzir. Verifique o servidor de TTS."
              : "Falha ao reproduzir com esta voz. Tente outra da lista.",
          );
        },
      });
    } catch {
      setTestando(false);
      restaurarSalvos();
    }
  }

  function parar() {
    stopSpeaking();
    setTestando(false);
    restaurarSalvos();
  }

  function resetar() {
    alterarRate(DEFAULT_TTS_RATE);
  }

  const percent = Math.round(rate * 100);
  const dirty =
    rate !== savedRate ||
    enabled !== savedEnabled ||
    voz !== savedVoz ||
    piperVoz !== savedPiperVoz;
  const usaPiper = voz === TTS_VOICE_AUTO || voz === TTS_VOICE_PIPER;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Voz & Áudio (TTS)</h1>
        <p className="text-sm text-muted-foreground">
          Configure a síntese de voz usada no painel de senhas, alertas sonoros e leitura de
          anamnese. As preferências são salvas neste navegador.
        </p>
      </div>

      <NinaLigaDesliga />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Volume2 className="h-4 w-4" /> Preferências de voz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Voz habilitada</div>
              <div className="text-xs text-muted-foreground">
                Quando desligada, o sistema não reproduz nenhuma fala automática.
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={alterarEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Voz do Totem</Label>
            <p className="text-xs text-muted-foreground">
              Escolha a voz usada para chamar as senhas. Com o Windows em inglês, a opção automática
              cai na voz americana — por isso selecione aqui uma voz em português.
            </p>
            <Select value={voz} onValueChange={setVoz}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a voz" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TTS_VOICE_AUTO}>Automática (escolhe sozinho)</SelectItem>
                <SelectItem value={TTS_VOICE_PIPER}>Usar Servidor Piper</SelectItem>
                {vozes.map((v) => (
                  <SelectItem key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vozes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Carregando as vozes do navegador… Se a lista não aparecer, recarregue a página.
              </p>
            ) : !temPtBr ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Nenhuma voz em português foi encontrada neste computador, então a lista mostra todas
                as disponíveis. Para o sotaque ficar correto, instale um pacote de voz em português
                nas configurações de idioma do Windows — ou use o Servidor Piper.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Esta escolha vale só para este navegador, porque as vozes disponíveis dependem do
                sistema de cada computador. Configure também na máquina que exibe o painel.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Voz do Servidor Piper</Label>
            <p className="text-xs text-muted-foreground">
              Usada quando o áudio vem do servidor (opções <strong>Automática</strong> e{" "}
              <strong>Usar Servidor Piper</strong>). Ao contrário das vozes do navegador, esta vale
              para todos os computadores da clínica.
            </p>
            <Select
              value={piperVoz || "__padrao__"}
              onValueChange={(v) => setPiperVoz(v === "__padrao__" ? "" : v)}
              disabled={!usaPiper}
            >
              <SelectTrigger>
                <SelectValue placeholder="Padrão do servidor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__padrao__">Padrão do servidor</SelectItem>
                {piperVozes.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label} — {v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {piperVozes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Carregando vozes do servidor…</p>
            ) : piperFonte === "fallback" ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                O servidor Piper não respondeu; a lista mostra as vozes do serviço de reserva.
              </p>
            ) : !usaPiper ? (
              <p className="text-xs text-muted-foreground">
                Sem efeito enquanto uma voz do navegador estiver selecionada acima.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <Label className="text-sm">Velocidade da fala</Label>
                <p className="text-xs text-muted-foreground">
                  Menor = mais lento e claro. Maior = mais rápido.
                </p>
              </div>
              <div className="text-sm font-medium tabular-nums">{percent}%</div>
            </div>
            <Slider
              value={[Math.round(rate * 100)]}
              min={Math.round(MIN_TTS_RATE * 100)}
              max={Math.round(MAX_TTS_RATE * 100)}
              step={5}
              onValueChange={(v) => alterarRate((v[0] ?? 55) / 100)}
            />
            <div className="flex justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>{Math.round(MIN_TTS_RATE * 100)}% (bem lento)</span>
              <span>100% (normal)</span>
              <span>{Math.round(MAX_TTS_RATE * 100)}% (rápido)</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {[0.4, 0.55, 0.7, 0.85, 1.0].map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={Math.abs(rate - v) < 0.01 ? "default" : "outline"}
                  onClick={() => alterarRate(v)}
                >
                  {Math.round(v * 100)}%
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={resetar} className="gap-1">
                <RotateCcw className="h-3.5 w-3.5" /> Padrão
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Frase de teste</Label>
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={FRASE_PADRAO}
            />
            <div className="flex gap-2">
              <Button onClick={testar} disabled={testando} className="gap-2">
                <Play className="h-4 w-4" /> Testar
              </Button>
              <Button onClick={parar} variant="outline" className="gap-2">
                <Square className="h-4 w-4" /> Parar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">
              {dirty
                ? "Você tem alterações não salvas. Clique em Salvar para aplicar."
                : "Preferências salvas — todas as telas usarão esta configuração."}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={descartar} disabled={!dirty}>
                Descartar
              </Button>
              <Button size="sm" onClick={salvar} disabled={!dirty || salvando} className="gap-2">
                <Save className="h-4 w-4" /> {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Ao escolher uma voz da lista, a fala é gerada pelo próprio navegador, sempre em
            português do Brasil. Nas opções <strong>Automática</strong> e{" "}
            <strong>Usar Servidor Piper</strong>, o áudio vem do servidor local Piper via{" "}
            <code>/api/public/tts</code>, e o painel volta para a voz do navegador se o Piper
            estiver fora do ar. A velocidade é aplicada mantendo o tom natural (
            <code>preservesPitch</code>).
          </div>
        </CardContent>
      </Card>

      <TesteServidorLocalCard />
    </div>
  );
}

// Mesma rota usada por src/lib/tts-service.ts. Valida tamanho do texto,
// restringe o formato de `voice` e tem fallback quando o Piper cai.
const TTS_ENDPOINT = "/api/public/tts";
function TesteServidorLocalCard() {
  const [texto, setTexto] = useState<string>("Olá! Este é um teste de síntese de voz.");
  const [voice, setVoice] = useState<string>("");
  const [vozesServidor, setVozesServidor] = useState<PiperVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    void fetchPiperVoices().then(({ voices }) => setVozesServidor(voices));
  }, []);

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  async function ouvir() {
    const t = texto.trim();
    if (!t) {
      toast.warning("Digite um texto para ouvir.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voice ? { text: t, voice } : { text: t }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error("Resposta de áudio vazia.");
      const url = URL.createObjectURL(blob);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      setAudioUrl(url);
      // Reproduz automaticamente após o elemento atualizar a src.
      setTimeout(() => {
        const el = audioRef.current;
        if (el) {
          el.load();
          el.play().catch(() => {
            // Autoplay bloqueado: o usuário pode usar o controle nativo.
          });
        }
      }, 0);
    } catch (err) {
      const msg =
        err instanceof TypeError
          ? "Não foi possível conectar ao servidor local de TTS. Verifique se ele está acessível."
          : `Falha ao gerar áudio: ${err instanceof Error ? err.message : "erro desconhecido"}`;
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Headphones className="h-4 w-4" /> Teste do servidor local (Piper)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">Texto</Label>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder="Digite o texto que deseja ouvir…"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label className="text-sm">Voz</Label>
            <Select
              value={voice || "__padrao__"}
              onValueChange={(v) => setVoice(v === "__padrao__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Padrão do servidor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__padrao__">Padrão do servidor</SelectItem>
                {vozesServidor.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label} — {v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={ouvir} disabled={loading} className="gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Ouvir
              </>
            )}
          </Button>
        </div>
        {audioUrl && <audio ref={audioRef} src={audioUrl} controls autoPlay className="w-full" />}
        <p className="text-xs text-muted-foreground">
          Faz uma requisição POST direta para <code>{TTS_ENDPOINT}</code>.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Botão único para ligar/desligar a assistente Nina na clínica atual.
 * Grava a feature flag `nina_desativada` (somente admin/gestor pela RLS).
 */
function NinaLigaDesliga() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const { desativada, loading } = useNinaDesativada();
  const [salvando, setSalvando] = useState(false);
  const ativa = !desativada;

  async function alternar(novoAtiva: boolean) {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await setClinicFeatureFlag(
        clinicaId,
        FLAG_NINA_DESATIVADA,
        !novoAtiva,
        "Desliga a assistente Nina nesta clínica",
      );
      toast.success(novoAtiva ? "Nina ativada" : "Nina desativada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" /> Assistente Nina
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Nina ativa</div>
            <p className="text-xs text-muted-foreground">
              Desligado, o botão “Perguntar à Nina” some para todos desta clínica.
            </p>
          </div>
          <Switch
            checked={ativa}
            disabled={loading || salvando || !clinicaId}
            onCheckedChange={(v) => void alternar(v)}
          />
        </div>
        <NinaRespostaAudio />
      </CardContent>
    </Card>
  );
}

/**
 * Interruptor "Responder em áudio quando o paciente mandar áudio" (por clínica).
 * Ligado por padrão: a flag gravada é a NEGATIVA
 * (`nina_resposta_audio_desativada`), pois flags sem registro nascem OFF.
 */
const FLAG_NINA_AUDIO_DESATIVADO = "nina_resposta_audio_desativada";

function NinaRespostaAudio() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const { enabled: desativado, loading } = useClinicFeatureFlag(FLAG_NINA_AUDIO_DESATIVADO);
  const [salvando, setSalvando] = useState(false);

  async function alternar(ligar: boolean) {
    if (!clinicaId) return;
    setSalvando(true);
    try {
      await setClinicFeatureFlag(
        clinicaId,
        FLAG_NINA_AUDIO_DESATIVADO,
        !ligar,
        "Desliga a resposta em áudio da Nina no WhatsApp",
      );
      toast.success(ligar ? "Nina vai responder em áudio" : "Nina vai responder só por texto");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t pt-4">
      <div>
        <div className="text-sm font-medium">Responder em áudio quando o paciente mandar áudio</div>
        <p className="text-xs text-muted-foreground">
          Nota de voz no WhatsApp. Respostas longas ou com lista vão como áudio curto + texto
          completo. Se a voz falhar, responde por texto.
        </p>
      </div>
      <Switch
        checked={!desativado}
        disabled={loading || salvando || !clinicaId}
        onCheckedChange={(v) => void alternar(v)}
      />
    </div>
  );
}
