import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Volume2, Play, Square, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
  const [rate, setRate] = useState<number>(DEFAULT_TTS_RATE);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [texto, setTexto] = useState<string>(FRASE_PADRAO);
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    setRate(getUserTtsRate());
    setEnabled(isUserTtsEnabled());
  }, []);

  function aplicarRate(next: number) {
    const clamped = Math.min(MAX_TTS_RATE, Math.max(MIN_TTS_RATE, next));
    setRate(clamped);
    setUserTtsRate(clamped);
  }

  function aplicarEnabled(on: boolean) {
    setEnabled(on);
    setUserTtsEnabled(on);
    if (!on) stopSpeaking();
  }

  async function testar() {
    if (!enabled) {
      toast.warning("Ative a voz antes de testar.");
      return;
    }
    setTestando(true);
    try {
      await speak(texto || FRASE_PADRAO, {
        onEnd: () => setTestando(false),
        onError: () => {
          setTestando(false);
          toast.error("Falha ao reproduzir. Verifique o servidor de TTS.");
        },
      });
    } catch {
      setTestando(false);
    }
  }

  function parar() {
    stopSpeaking();
    setTestando(false);
  }

  function resetar() {
    aplicarRate(DEFAULT_TTS_RATE);
    toast.success("Velocidade restaurada para o padrão.");
  }

  const percent = Math.round(rate * 100);

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
            <Switch checked={enabled} onCheckedChange={aplicarEnabled} />
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
              onValueChange={(v) => aplicarRate((v[0] ?? 55) / 100)}
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
                  onClick={() => aplicarRate(v)}
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

          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            A voz é gerada pelo servidor local Piper via <code>/api/tts</code>.
            A velocidade é aplicada no navegador mantendo o tom natural
            (<code>preservesPitch</code>). Quando o Piper estiver indisponível,
            o painel usa a voz nativa do navegador na mesma velocidade.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}