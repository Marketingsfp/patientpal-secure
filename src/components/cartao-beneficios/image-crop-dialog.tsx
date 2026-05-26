import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

async function getCroppedDataUrl(src: string, area: Area): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(
    img,
    Math.round(area.x), Math.round(area.y),
    Math.round(area.width), Math.round(area.height),
    0, 0,
    Math.round(area.width), Math.round(area.height),
  );
  // PNG mantém transparência; se a imagem for jpeg, ainda funciona.
  return canvas.toDataURL("image/png");
}

export function ImageCropDialog({ open, src, onClose, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<string>("free");
  const [pixels, setPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixels(areaPixels);
  }, []);

  const apply = async () => {
    if (!pixels) return;
    try {
      setBusy(true);
      const url = await getCroppedDataUrl(src, pixels);
      onCropped(url);
      onClose();
    } catch (e: any) {
      // CORS pode falhar — informa o usuário.
      alert("Não foi possível cortar esta imagem (CORS).");
    } finally {
      setBusy(false);
    }
  };

  const aspectNum = aspect === "free" ? undefined : Number(aspect);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cortar imagem</DialogTitle>
        </DialogHeader>
        <div className="relative w-full bg-muted rounded-md overflow-hidden" style={{ height: 420 }}>
          {open && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspectNum}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition={false}
              objectFit="contain"
            />
          )}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Proporção</span>
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASPECTS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-[260px]">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={apply} disabled={busy || !pixels}>{busy ? "Cortando…" : "Aplicar corte"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}