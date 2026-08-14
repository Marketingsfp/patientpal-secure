import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Upload } from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";
import { detectDescriptor, ensureFaceModels } from "@/lib/face-recognition";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onClose: () => void;
  onCaptured: (descriptor: number[], foto?: Blob) => Promise<void> | void;
  titulo?: string;
}

export function FaceCaptureDialog({ open, onClose, onCaptured, titulo = "Capturar rosto" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [camErro, setCamErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [msg, setMsg] = useState("Posicione o rosto na câmera");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCamErro(null);
    setMsg("Posicione o rosto na câmera");
    (async () => {
      try {
        await ensureFaceModels();
        stop();
        const stream = await navigator.mediaDevices.getUserMedia(
          deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: true },
        );
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            const cams = list.filter((d) => d.kind === "videoinput");
            setDevices(cams);
            if (!deviceId) {
              const atual = stream.getVideoTracks()[0]?.getSettings().deviceId;
              if (atual) setDeviceId(atual);
            }
          }
        } catch {
          /* enumeração indisponível */
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("Camera Error:", e);
        const nome = e?.name as string | undefined;
        if (nome === "NotReadableError" || nome === "TrackStartError") {
          setCamErro("Câmera em uso por outro app (Zoom/Discord/OBS)");
        } else if (nome === "NotAllowedError" || nome === "SecurityError") {
          setCamErro("Permissão bloqueada no navegador");
        } else if (
          nome === "NotFoundError" ||
          nome === "DevicesNotFoundError" ||
          nome === "OverconstrainedError"
        ) {
          setCamErro("Nenhuma webcam física encontrada");
        } else {
          setCamErro("Não foi possível iniciar a câmera");
        }
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setDevices(list.filter((d) => d.kind === "videoinput"));
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, tentativa, deviceId]);

  function resetarCamera() {
    stop();
    setCamErro(null);
    setBusy(false);
    setMsg("Reiniciando câmera…");
    setTentativa((t) => t + 1);
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const snapshot = useCallback(async (): Promise<Blob | undefined> => {
    const v = videoRef.current;
    if (!v) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | undefined>((res) =>
      canvas.toBlob((b) => res(b ?? undefined), "image/jpeg", 0.9),
    );
  }, []);

  async function capturar() {
    if (!videoRef.current) return;
    setBusy(true);
    setMsg("Analisando…");
    const desc = await detectDescriptor(videoRef.current);
    if (!desc) {
      setMsg("Rosto não detectado. Aproxime e tente novamente.");
      setBusy(false);
      return;
    }
    setMsg("Salvando…");
    try {
      const foto = await snapshot();
      await onCaptured(Array.from(desc), foto);
      setMsg("Foto registrada!");
      stop();
      setTimeout(onClose, 700);
    } catch (e: any) {
      mostrarErro(e);
      setBusy(false);
      setMsg("Tente novamente");
    }
  }

  async function usarArquivo(file: File) {
    setBusy(true);
    setMsg("Analisando imagem…");
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      const desc = await detectDescriptor(img);
      URL.revokeObjectURL(url);
      if (!desc) {
        setMsg("Rosto não detectado na imagem. Tente outra foto.");
        setBusy(false);
        return;
      }
      setMsg("Salvando…");
      await onCaptured(Array.from(desc), file);
      setMsg("Foto registrada!");
      stop();
      setTimeout(onClose, 700);
    } catch (e: any) {
      mostrarErro(e);
      setBusy(false);
      setMsg("Tente novamente");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          stop();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> {titulo}
          </DialogTitle>
          <DialogDescription>{camErro ?? msg}</DialogDescription>
        </DialogHeader>
        {camErro ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm space-y-3">
            <p className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {camErro}. Verifique se há uma webcam conectada e libere o acesso à câmera nas
                permissões do navegador.
              </span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={resetarCamera}>
              <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-x-16 inset-y-6 border-4 border-white/60 rounded-[50%] pointer-events-none" />
            <span className="absolute bottom-2 inset-x-0 text-center text-[11px] text-white/85 pointer-events-none">
              Enquadre o rosto do paciente aqui
            </span>
          </div>
        )}
        {devices.length > 1 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Câmera</p>
            <Select
              value={deviceId}
              onValueChange={(v) => {
                stop();
                setDeviceId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar câmera" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d, i) => (
                  <SelectItem key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Câmera ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void usarArquivo(f);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4 mr-1" /> Anexar foto / arquivo
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button onClick={capturar} disabled={busy || !!camErro}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1" />
            )}{" "}
            Capturar foto biométrica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
