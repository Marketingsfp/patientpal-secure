import { useRef, useState } from "react";
import { Loader2, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCAL_TTS } from "@/lib/coach/local-tts";
import {
  ATIVIDADES,
  PERSONAGENS,
  PROVEDORES,
  VOZES_GEMINI,
  VOZES_PIPER,
  parseVozConfig,
  type VozConfig,
  type VozEscolha,
  type VozProvedor,
} from "@/lib/coach/voz-config";
import { supabase } from "@/integrations/supabase/client";
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

/** Escolha da voz por atividade e por personagem (vale para a clínica ativa). */
export function VozEditor({ value, onChange }: Props) {
  const cfg = parseVozConfig(value);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const FRASE =
    "Oi, bom dia! Aqui é da clínica. Vi que você tem interesse em agendar, posso te ajudar?";

  async function ouvir(chave: string, esc: VozEscolha) {
    setErro(null);
    audioRef.current?.pause();
    setTocando(chave);
    try {
      const qs = new URLSearchParams({
        text: FRASE,
        provedor: esc.provedor,
        voice: esc.piper,
        vozgemini: esc.gemini,
        url: DEFAULT_LOCAL_TTS.url,
      });
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(`/api/coach/tts?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${sess.session?.access_token}` },
      });
      if (res.status === 204) throw new Error("Nenhum motor de voz respondeu.");
      if (!res.ok) throw new Error(`Falha ao gerar áudio (${res.status})`);
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setTocando(null);
      await audio.play();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ouvir a voz.");
      setTocando(null);
    }
  }


  function set(
    atividade: keyof VozConfig,
    personagem: "masculino" | "feminino",
    patch: Partial<VozEscolha>,
  ) {
    onChange({
      ...cfg,
      [atividade]: {
        ...cfg[atividade],
        [personagem]: { ...cfg[atividade][personagem], ...patch },
      },
    });
  }

  return (
    <div className="mb-5 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2 mb-1">
        <Volume2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Vozes do treinamento</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Escolha o motor e a voz que o paciente simulado usa em cada atividade. A escolha vale para
        todas as atendentes desta clínica. Use "Ouvir" para escutar uma amostra antes de salvar.
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
                const esc = cfg[a.id][p.id];
                const mostraPiper = esc.provedor === "auto" || esc.provedor === "piper";
                const mostraGemini = esc.provedor === "auto" || esc.provedor === "gemini";
                const vozesPiper = VOZES_PIPER.filter((v) => v.genero === p.id);
                const vozesGemini = VOZES_GEMINI.filter((v) => v.genero === p.id);
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
                        disabled={tocando === `${a.id}-${p.id}`}
                        onClick={() => ouvir(`${a.id}-${p.id}`, esc)}
                      >
                        {tocando === `${a.id}-${p.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Ouvir
                      </Button>
                    </div>
                    <Select
                      value={esc.provedor}
                      onValueChange={(v) => set(a.id, p.id, { provedor: v as VozProvedor })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVEDORES.map((prov) => (
                          <SelectItem key={prov.id} value={prov.id}>
                            {prov.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {PROVEDORES.find((x) => x.id === esc.provedor)?.descricao}
                    </p>

                    {mostraPiper && (
                      <div>
                        <span className="text-[11px] text-muted-foreground">Voz no Piper local</span>
                        <Select
                          value={esc.piper}
                          onValueChange={(v) => set(a.id, p.id, { piper: v })}
                        >
                          <SelectTrigger className="mt-1 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {vozesPiper.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {mostraGemini && (
                      <div>
                        <span className="text-[11px] text-muted-foreground">Voz no Gemini</span>
                        <Select
                          value={esc.gemini}
                          onValueChange={(v) => set(a.id, p.id, { gemini: v })}
                        >
                          <SelectTrigger className="mt-1 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {vozesGemini.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
