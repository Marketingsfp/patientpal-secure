import { useCallback, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { cn } from "@/lib/utils";

type Props = {
  onTranscript: (text: string) => void;
  /** Se true, anexa ao texto existente com espaço; caso contrário substitui via onTranscript. */
  append?: boolean;
  currentValue?: string;
  className?: string;
  size?: "sm" | "icon";
  /** Instrução opcional ao modelo (ex.: "Transcreva como evolução médica formal") */
  prompt?: string;
  title?: string;
  /** Inicia a gravação automaticamente ao montar / quando muda para true */
  autoStart?: boolean;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = String(r.result ?? "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function VoiceInput({
  onTranscript,
  append = true,
  currentValue = "",
  className,
  size = "icon",
  prompt,
  title = "Gravar áudio",
  autoStart = false,
}: Props) {
  const transcribe = useServerFn(transcribeAudio);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    recRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        setLoading(true);
        try {
          const blob = new Blob(chunksRef.current, { type: mime });
          if (blob.size < 800) {
            toast.info("Áudio muito curto.");
            return;
          }
          const audioBase64 = await blobToBase64(blob);
          const out = await transcribe({ data: { audioBase64, mimeType: mime, prompt } });
          if (out.error) {
            toast.error(out.error);
            return;
          }
          if (!out.text) {
            toast.info("Nada foi reconhecido.");
            return;
          }
          if (append && currentValue) {
            onTranscript(`${currentValue.replace(/\s+$/, "")} ${out.text}`);
          } else {
            onTranscript(out.text);
          }
        } finally {
          setLoading(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível acessar o microfone.");
    }
  }, [append, currentValue, onTranscript, prompt, transcribe]);

  // Auto-start quando solicitado
  const startedRef = useRef(false);
  if (autoStart && !startedRef.current && !recording && !loading) {
    startedRef.current = true;
    // dispara fora do ciclo de render
    setTimeout(() => { void start(); }, 0);
  }
  if (!autoStart) startedRef.current = false;

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      size={size}
      className={cn("shrink-0", className)}
      onClick={recording ? stop : start}
      disabled={loading}
      title={recording ? "Parar gravação" : title}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : recording ? (
        <Square className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}