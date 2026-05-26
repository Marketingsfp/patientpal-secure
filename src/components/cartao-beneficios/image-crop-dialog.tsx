import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

type CropRect = { x: number; y: number; width: number; height: number };
type DragMode = "new" | "move" | "nw" | "ne" | "sw" | "se";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function initialCrop(aspect?: number, img?: HTMLImageElement | null): CropRect {
  const box = img?.getBoundingClientRect();
  const displayRatio = box && box.height > 0 ? box.width / box.height : 1;
  if (!aspect) return { x: 10, y: 10, width: 80, height: 80 };
  const percentRatio = aspect / displayRatio;
  let width = 80;
  let height = width / percentRatio;
  if (height > 80) {
    height = 80;
    width = height * percentRatio;
  }
  return { x: (100 - width) / 2, y: (100 - height) / 2, width, height };
}

function rectFromPoints(
  anchor: { x: number; y: number },
  point: { x: number; y: number },
  aspect?: number,
  img?: HTMLImageElement | null,
): CropRect {
  const box = img?.getBoundingClientRect();
  const displayRatio = box && box.height > 0 ? box.width / box.height : 1;
  const signX = point.x >= anchor.x ? 1 : -1;
  const signY = point.y >= anchor.y ? 1 : -1;
  let width = Math.abs(point.x - anchor.x);
  let height = Math.abs(point.y - anchor.y);
  if (aspect && height > 0 && width > 0) {
    const percentRatio = aspect / displayRatio;
    if (width / height > percentRatio) width = height * percentRatio;
    else height = width / percentRatio;
  }
  const x = signX > 0 ? anchor.x : anchor.x - width;
  const y = signY > 0 ? anchor.y : anchor.y - height;
  const safeX = clamp(x, 0, 100);
  const safeY = clamp(y, 0, 100);
  return {
    x: safeX,
    y: safeY,
    width: clamp(width, 1, 100 - safeX),
    height: clamp(height, 1, 100 - safeY),
  };
}

async function cropToDataUrl(src: string, area: CropRect): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const sx = Math.round((area.x / 100) * img.naturalWidth);
  const sy = Math.round((area.y / 100) * img.naturalHeight);
  const sw = Math.max(1, Math.round((area.width / 100) * img.naturalWidth));
  const sh = Math.max(1, Math.round((area.height / 100) * img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/png");
}

export function ImageCropDialog({ open, src, onClose, onCropped }: Props) {
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [aspect, setAspect] = useState<string>("free");
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    start: { x: number; y: number };
    crop: CropRect | null;
  } | null>(null);

  const aspectNum = aspect === "free" ? undefined : Number(aspect);

  useEffect(() => {
    if (!open) return;
    setCrop(null);
  }, [open, src]);

  const pointFromEvent = (event: PointerEvent | React.PointerEvent) => {
    const img = imgRef.current;
    if (!img) return null;
    const box = img.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - box.left) / box.width) * 100, 0, 100),
      y: clamp(((event.clientY - box.top) / box.height) * 100, 0, 100),
    };
  };

  const beginDrag = (mode: DragMode) => (event: React.PointerEvent) => {
    const start = pointFromEvent(event);
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { mode, start, crop };
    const move = (ev: PointerEvent) => {
      const point = pointFromEvent(ev);
      const drag = dragRef.current;
      if (!point || !drag) return;
      const base = drag.crop;
      if (drag.mode === "new" || !base) {
        setCrop(rectFromPoints(drag.start, point, aspectNum, imgRef.current));
        return;
      }
      if (drag.mode === "move") {
        const dx = point.x - drag.start.x;
        const dy = point.y - drag.start.y;
        setCrop({
          ...base,
          x: clamp(base.x + dx, 0, 100 - base.width),
          y: clamp(base.y + dy, 0, 100 - base.height),
        });
        return;
      }
      const anchors = {
        nw: { x: base.x + base.width, y: base.y + base.height },
        ne: { x: base.x, y: base.y + base.height },
        sw: { x: base.x + base.width, y: base.y },
        se: { x: base.x, y: base.y },
      } as const;
      setCrop(rectFromPoints(anchors[drag.mode], point, aspectNum, imgRef.current));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const apply = async () => {
    if (!crop || !imgRef.current) return;
    try {
      setBusy(true);
      const url = await cropToDataUrl(src, crop);
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
        <div
          className="w-full bg-muted rounded-md overflow-auto flex items-center justify-center"
          style={{ maxHeight: 480 }}
        >
          <div
            className="relative inline-block max-w-full cursor-crosshair select-none"
            onPointerDown={beginDrag("new")}
          >
            <img
              ref={imgRef}
              src={src}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              className="block max-w-full"
              style={{ maxHeight: 460 }}
              onLoad={() => setCrop((current) => current ?? initialCrop(aspectNum, imgRef.current))}
            />
            {crop && (
              <div
                className="absolute border-2 border-primary bg-primary/10 cursor-move"
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.width}%`,
                  height: `${crop.height}%`,
                }}
                onPointerDown={beginDrag("move")}
              >
                {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                  <span
                    key={handle}
                    className={`absolute h-3 w-3 rounded-sm border border-primary bg-background ${
                      handle === "nw"
                        ? "-left-1.5 -top-1.5 cursor-nwse-resize"
                        : handle === "ne"
                          ? "-right-1.5 -top-1.5 cursor-nesw-resize"
                          : handle === "sw"
                            ? "-left-1.5 -bottom-1.5 cursor-nesw-resize"
                            : "-right-1.5 -bottom-1.5 cursor-nwse-resize"
                    }`}
                    onPointerDown={beginDrag(handle)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <span className="text-xs text-muted-foreground">Proporção</span>
          <Select
            value={aspect}
            onValueChange={(v) => {
              setAspect(v);
              setCrop(initialCrop(v === "free" ? undefined : Number(v), imgRef.current));
            }}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECTS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-2">
            Arraste sobre a imagem para selecionar a área.
          </span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={busy || !crop || crop.width < 2 || crop.height < 2}>
            {busy ? "Cortando…" : "Aplicar corte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}