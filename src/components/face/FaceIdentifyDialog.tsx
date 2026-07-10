import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanFace, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  detectDescriptor,
  ensureFaceModels,
  euclidean,
  FACE_MATCH_THRESHOLD,
} from "@/lib/face-recognition";

export interface FaceCandidate {
  id: string;
  nome: string;
  descriptor: number[];
  extra?: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  candidates: FaceCandidate[];
  onMatched: (m: FaceCandidate) => void;
  titulo?: string;
}

export function FaceIdentifyDialog({
  open,
  onClose,
  candidates,
  onMatched,
  titulo = "Identificar por rosto",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [msg, setMsg] = useState("Posicione o rosto na câmera");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureFaceModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        await tentar();
      } catch {
        toast.error("Não foi possível acessar a câmera");
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function tentar() {
    if (!videoRef.current) return;
    setBusy(true);
    setMsg("Detectando rosto…");
    let desc: Float32Array | null = null;
    for (let i = 0; i < 10; i++) {
      if (!videoRef.current || !streamRef.current) return;
      desc = await detectDescriptor(videoRef.current);
      if (desc) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!desc) {
      setMsg("Rosto não detectado. Tente novamente.");
      setBusy(false);
      return;
    }
    let melhor: { c: FaceCandidate; dist: number } | null = null;
    for (const c of candidates) {
      if (!Array.isArray(c.descriptor) || c.descriptor.length !== 128) continue;
      const d = euclidean(desc, c.descriptor);
      if (!melhor || d < melhor.dist) melhor = { c, dist: d };
    }
    if (melhor && melhor.dist <= FACE_MATCH_THRESHOLD) {
      setMsg(`Olá, ${melhor.c.nome}!`);
      stop();
      setTimeout(() => {
        onMatched(melhor!.c);
        onClose();
      }, 400);
    } else {
      setMsg("Não foi possível reconhecer. Tente novamente.");
      setBusy(false);
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
            <ScanFace className="h-5 w-5" /> {titulo}
          </DialogTitle>
          <DialogDescription>{msg}</DialogDescription>
        </DialogHeader>
        <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-8 border-4 border-white/50 rounded-full pointer-events-none" />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button onClick={tentar} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Tentar novamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
