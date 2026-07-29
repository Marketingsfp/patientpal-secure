import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Volume2, Play, Square, RotateCcw, Save, Headphones, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClinica } from "@/hooks/use-clinica";
import {
  DEFAULT_TTS_RATE,
  MAX_TTS_RATE,
  MIN_TTS_RATE,
  getUserTtsRate,
  setUserTtsRate,
  isUserTtsEnabled,
  setUserTtsEnabled,
  speak,
  stopSpeaking,
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

const FRASE_PADRAO =
  "Senha número 27, guichê 3. Boa tarde, dirija-se ao atendimento.";

function VozConfigPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const [rate, setRate] = useState<number>(DEFAULT_TTS_RATE);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [savedRate, setSavedRate] = useState<number>(DEFAULT_TTS_RATE);
  const [savedEnabled, setSavedEnabled] = useState<boolean>(true);
  const [texto, setTexto] = useState<string>(FRASE_PADRAO);
  const [testando, setTestando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Fonte de verdade: banco por clínica (para propagar em Realtime ao
    // painel). Se não houver linha ainda, usa o cache local como fallback.
    let cancelado = false;
    (async () => {
      let r = getUserTtsRate();
      let e = isUserTtsEnabled();
      if (clinicaId) {
        const cfg = await fetchClinicaTtsConfig(clinicaId);
        if (cfg) {
          r = cfg.rate;
          e = cfg.enabled;
          applyClinicaTtsConfig(cfg);
        }
      }
      if (cancelado) return;
      setRate(r);
      setSavedRate(r);
      setEnabled(e);
      setSavedEnabled(e);
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
      // Fonte de verdade compartilhada com o painel (Realtime).
      if (clinicaId) {
        const { error } = await saveClinicaTtsConfig(clinicaId, { rate, enabled });
        if (error) {
          toast.error(`Falha ao sincronizar com o painel: ${error}`);
          return;
        }
      }
      setSavedRate(rate);
      setSavedEnabled(enabled);
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
  }

  async function testar() {
    if (!enabled) {
      toast.warning("Ative a voz antes de testar.");
      return;
    }
    // Aplica temporariamente a velocidade em edição só para o teste,
    // sem persistir — o Salvar continua responsável por gravar.
    setUserTtsRate(rate);
    setTestando(true);
    try {
      await speak(texto || FRASE_PADRAO, {
        onEnd: () => {
          setTestando(false);
          setUserTtsRate(savedRate);
        },
        onError: () => {
          setTestando(false);
          setUserTtsRate(savedRate);
          toast.error("Falha ao reproduzir. Verifique o servidor de TTS.");
        },
      });
    } catch {
      setTestando(false);
      setUserTtsRate(savedRate);
    }
  }

  function parar() {
    stopSpeaking();
    setTestando(false);
    setUserTtsRate(savedRate);
  }

  function resetar() {
    alterarRate(DEFAULT_TTS_RATE);
  }

  const percent = Math.round(rate * 100);
  const dirty = rate !== savedRate || enabled !== savedEnabled;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Voz & Áudio (TTS)</h1>
        <p className="text-sm text-muted-foreground">
          Configure a síntese de voz usada no painel de senhas, alertas sonoros
          e leitura de anamnese. As preferências são salvas neste navegador.
        </p>
      </div>

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
            <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
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
              <Button
                variant="outline"
                size="sm"
                onClick={descartar}
                disabled={!dirty}
              >
                Descartar
              </Button>
              <Button
                size="sm"
                onClick={salvar}
                disabled={!dirty || salvando}
                className="gap-2"
              >
                <Save className="h-4 w-4" /> {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            A voz é gerada pelo servidor local Piper via <code>/api/tts</code>.
            A velocidade é aplicada no navegador mantendo o tom natural
            (<code>preservesPitch</code>). Quando o Piper estiver indisponível,
            o painel usa a voz nativa do navegador na mesma velocidade.
          </div>
        </CardContent>
      </Card>

      <TesteServidorLocalCard />
    </div>
  );
}

const TTS_ENDPOINT = "https://server-mj.tailec426c.ts.net/api/tts";
const VOZES = [
  { value: "faber", label: "Faber (Masculino)" },
  { value: "feminina", label: "Feminina" },
] as const;

function TesteServidorLocalCard() {
  const [texto, setTexto] = useState<string>(
    "Olá! Este é um teste de síntese de voz.",
  );
  const [voice, setVoice] = useState<string>("faber");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrlRef = useRef<string | null>(null);

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
        body: JSON.stringify({ text: t, voice }),
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
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOZES.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
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
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            autoPlay
            className="w-full"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Faz uma requisição POST direta para <code>{TTS_ENDPOINT}</code>.
        </p>
      </CardContent>
    </Card>
  );
}