import { useCallback, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SERVICOS_PRESET = [
  "Serviços laboratoriais",
  "Serviços de clínica médica",
  "Serviços de diagnóstico de imagem",
];

/**
 * Hook que abre um modal para o usuário revisar/editar a descrição
 * da NFS-e antes de emitir. Retorna o texto final ou `null` se cancelado.
 */
export function usePromptDescricaoNfse() {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const prompt = useCallback(async (sugestao: string): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setTexto(sugestao ?? "");
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const confirm = () => {
    const r = resolverRef.current; resolverRef.current = null;
    setOpen(false);
    const t = (texto ?? "").trim();
    r?.(t.length ? t : null);
  };
  const cancel = () => {
    const r = resolverRef.current; resolverRef.current = null;
    setOpen(false);
    r?.(null);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descrição dos serviços</DialogTitle>
          <DialogDescription>
            Revise e edite o texto que sairá impresso na NFS-e. Este é o
            texto que o tomador verá na nota.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Descrição</Label>
          <div className="flex flex-wrap gap-2">
            {SERVICOS_PRESET.map((s) => (
              <Button
                key={s}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTexto(s)}
              >
                {s}
              </Button>
            ))}
          </div>
          <Textarea
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={2000}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {texto.length}/2000 caracteres
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>Cancelar</Button>
          <Button onClick={confirm} disabled={!texto.trim()}>Emitir com este texto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { prompt, dialog };
}