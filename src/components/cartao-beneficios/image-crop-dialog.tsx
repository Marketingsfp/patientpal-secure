import { lazy, Suspense, useRef, useState } from "react";
import type { Crop, PixelCrop } from "react-image-crop";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ReactCrop = lazy(async () => {
  await import("react-image-crop/dist/ReactCrop.css");
  const mod = await import("react-image-crop");
  return { default: mod.default };
});

interface Props {
  open: boolean;
  src: string;
  onClose: () => void;
  onCropped: (dataUrl: string) => void;
}

const ASPECTS: { label: string; value: string }[] = [
  { label: "Livre", value: "free" },
  { label: "1:1", value: "1" },
  { label: "4:3", value: "1.3333" },
  { label: "3:4", value: "0.75" },
  { label: "16:9", value: "1.7777" },
  { label: "9:16", value: "0.5625" },
];

async function cropToDataUrl(src: string, area: PixelCrop, displayed: { w: number; h: number }): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const scaleX = img.naturalWidth / displayed.w;
  const scaleY = img.naturalHeight / displayed.h;
  const sx = Math.round(area.x * scaleX);
  const sy = Math.round(area.y * scaleY);
  const sw = Math.round(area.width * scaleX);
  const sh = Math.round(area.height * scaleY);
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/png");
}

export function ImageCropDialog({ open, src, onClose, onCropped }: Props) {
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState<string>("free");
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const aspectNum = aspect === "free" ? undefined : Number(aspect);

  const apply = async () => {
    if (!completed || !imgRef.current) return;
    try {
      setBusy(true);
      const url = await cropToDataUrl(src, completed, {
        w: imgRef.current.width,
        h: imgRef.current.height,
      });
      onCropped(url);
      onClose();
    } catch {
      alert("Não foi possível cortar esta imagem (CORS).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cortar imagem</DialogTitle>
        </DialogHeader>
        <div className="w-full bg-muted rounded-md overflow-auto flex items-center justify-center" style={{ maxHeight: 480 }}>
          {open && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompleted(c)}
              aspect={aspectNum}
              ruleOfThirds
            >
              <img
                ref={imgRef}
                src={src}
                alt=""
                crossOrigin="anonymous"
                style={{ maxHeight: 460, maxWidth: "100%" }}
              />
            </ReactCrop>
          )}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <span className="text-xs text-muted-foreground">Proporção</span>
          <Select value={aspect} onValueChange={(v) => { setAspect(v); setCrop(undefined); setCompleted(null); }}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASPECTS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-2">Arraste sobre a imagem para selecionar a área.</span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={apply} disabled={busy || !completed || completed.width < 2 || completed.height < 2}>
            {busy ? "Cortando…" : "Aplicar corte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}