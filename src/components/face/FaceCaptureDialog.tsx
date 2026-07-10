import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { detectDescriptor, ensureFaceModels } from "@/lib/face-recognition";

interface Props { open: boolean; onClose: () => void; onCaptured: (descriptor: number[]) => Promise<void> | void; titulo?: string; }

export function FaceCaptureDialog({ open, onClose, onCaptured, titulo = "Capturar rosto" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("Posicione o rosto na câmera");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureFaceModels();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      } catch { toast.error("Não foi possível acessar a câmera"); onClose(); }
    })();
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stop() { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }

  async function capturar() {
    if (!videoRef.current) return;
    setBusy(true); setMsg("Analisando…");
    const desc = await detectDescriptor(videoRef.current);
    if (!desc) { setMsg("Rosto não detectado. Aproxime e tente novamente."); setBusy(false); return; }
    setMsg("Salvando…");
    try { await onCaptured(Array.from(desc)); setMsg("Foto registrada!"); stop(); setTimeout(onClose, 700); }
    catch (e: any) { mostrarErro(e); setBusy(false); setMsg("Tente novamente"); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { stop(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> {titulo}</DialogTitle>
          <DialogDescription>{msg}</DialogDescription>
        </DialogHeader>
        <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-8 border-4 border-white/50 rounded-full pointer-events-none" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { stop(); onClose(); }}>Cancelar</Button>
          <Button onClick={capturar} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Capturar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
