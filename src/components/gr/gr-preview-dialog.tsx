import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

export interface GRPreviewDialogProps {
  open: boolean;
  html: string | null;
  title?: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

/**
 * Prévia da GR antes de imprimir — mostra o HTML final (idêntico ao que sairá
 * na impressora) em um iframe. Só quando o usuário clica em "Imprimir agora" é
 * que a impressão de fato é disparada e a via é gravada no histórico.
 */
export function GRPreviewDialog({ open, html, title, onCancel, onConfirm }: GRPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    if (!open || !html) return;
    const ifr = iframeRef.current;
    if (!ifr) return;
    const doc = ifr.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [open, html]);

  const handleConfirm = async () => {
    if (imprimindo) return;
    setImprimindo(true);
    try {
      await onConfirm();
    } finally {
      setImprimindo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !imprimindo) onCancel(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Prévia da GR"}</DialogTitle>
          <DialogDescription>
            Confira <strong>CLÍNICA</strong>, <strong>PRESTADOR</strong> e, se houver, o selo de{" "}
            <strong>GRATUIDADE</strong> antes de imprimir. Nada é gravado no histórico até você confirmar.
          </DialogDescription>
        </DialogHeader>
        <div className="w-full rounded border bg-muted/30" style={{ height: "60vh" }}>
          <iframe
            ref={iframeRef}
            title="Prévia GR"
            className="h-full w-full bg-white"
            style={{ border: 0 }}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={imprimindo}>
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={imprimindo || !html}>
            <Printer className="mr-1 h-4 w-4" />
            {imprimindo ? "Enviando…" : "Imprimir agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
