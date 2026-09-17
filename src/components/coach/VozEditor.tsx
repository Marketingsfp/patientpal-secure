import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ATIVIDADES,
  PERSONAGENS,
  VOZ_PADRAO_SISTEMA,
  parseVozConfig,
  type VozAtividade,
  type VozConfig,
  type VozPersonagem,
} from "@/lib/coach/voz-sistema";
import { fetchPiperVoices, speakComVoz, stopSpeaking, type PiperVoice } from "@/lib/tts-service";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  value: unknown;
  onChange: (next: VozConfig) => void;
};

const FRASE =
  "Oi, bom dia! Aqui é da clínica. Vi que você tem interesse em agendar, posso te ajudar?";

/**
 * Escolha da voz do paciente simulado, por atividade e personagem.
 * As vozes vêm do mesmo catálogo da tela Voz & Áudio (TTS) do sistema.
 */
export function VozEditor({ value, onChange }: Props) {
  const [catalogo, setCatalogo] = useState<PiperVoice[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tocando, setTocando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    fetchPiperVoices().then(({ voices }) => {
      if (!montado.current) return;
      setCatalogo(voices);
      setCarregando(false);
    });
    return () => {
      montado.current = false;
      stopSpeaking();
    };
  }, []);

  const cfg = parseVozConfig(value);

  function set(atividade: VozAtividade, personagem: VozPersonagem, voz: string) {
    onChange({
      ...cfg,
      [atividade]: { ...cfg[atividade], [personagem]: voz },
    });
  }

  async function ouvir(chave: string, voz: string) {
    setErro(null);
    setTocando(chave);
    await speakComVoz(FRASE, voz, {
      onEnd: () => setTocando(null),
      onError: () => {
        setErro("Não foi possível ouvir a voz agora. Verifique a tela Voz & Áudio (TTS).");
        setTocando(null);
      },
    });
  }

  return (
    <div className="mb-5 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2 mb-1">
        <Volume2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Vozes do treinamento</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Escolha qual voz o paciente simulado usa em cada atividade. As vozes são as mesmas do
        sistema; velocidade e servidor de voz ficam em{" "}
        <Link
          to="/app/configuracoes/voz"
          className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
        >
          Voz &amp; Áudio (TTS)
          <ExternalLink className="h-3 w-3" />
        </Link>
        . A escolha vale para todas as atendentes desta clínica.
      </p>

      {erro && (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {erro}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {ATIVIDADES.map((a) => (
          <div key={a.id} className="rounded-md border bg-card p-3">
            <p className="text-sm font-medium">{a.label}</p>
            <p className="text-[11px] text-muted-foreground mb-3">{a.ajuda}</p>
            <div className="space-y-4">
              {PERSONAGENS.map((p) => {
                const chave = `${a.id}-${p.id}`;
                const voz = cfg[a.id][p.id];
                return (
                  <div key={p.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {p.label}
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        disabled={tocando === chave}
                        onClick={() => ouvir(chave, voz)}
                      >
                        {tocando === chave ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Ouvir amostra
                      </Button>
                    </div>
                    <Select
                      value={voz || VOZ_PADRAO_SISTEMA || "__padrao__"}
                      onValueChange={(v) => set(a.id, p.id, v === "__padrao__" ? "" : v)}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue
                          placeholder={carregando ? "Carregando vozes…" : "Voz padrão do sistema"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__padrao__">Voz padrão do sistema</SelectItem>
                        {catalogo.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!carregando && catalogo.length === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          O catálogo de vozes não respondeu agora. O treinamento continua usando a voz padrão do
          sistema.
        </p>
      )}
    </div>
  );
}
