import { useState } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTts } from "@/hooks/use-tts";
import { cn } from "@/lib/utils";

interface TTSButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "icon" | "default";
  variant?: "ghost" | "outline" | "secondary" | "default";
  label?: string;
  /** Se true, esconde o botão quando TTS não estiver habilitado para a clínica. */
  hideWhenDisabled?: boolean;
}

/**
 * Botão 🔊 que lê `text` em voz alta usando o TTS local (Piper) via proxy.
 * Só aparece nas clínicas habilitadas (Menino Jesus) — caso contrário, retorna null
 * quando hideWhenDisabled=true (padrão).
 */
export function TTSButton({
  text,
  className,
  size = "icon",
  variant = "ghost",
  label = "Ouvir",
  hideWhenDisabled = true,
}: TTSButtonProps) {
  const { enabled, speak, stop } = useTts();
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  if (!enabled && hideWhenDisabled) return null;

  const handle = async () => {
    if (playing) {
      stop();
      setPlaying(false);
      return;
    }
    setLoading(true);
    await speak(text, {
      onEnd: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
    setLoading(false);
    setPlaying(true);
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("gap-1", className)}
      onClick={handle}
      title={label}
      aria-label={label}
      disabled={!enabled}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : playing ? (
        <VolumeX className="h-4 w-4" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
      {size !== "icon" && <span>{playing ? "Parar" : label}</span>}
    </Button>
  );
}