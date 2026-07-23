import { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  uploadOdontoImagem,
  CATEGORIA_LABEL,
  type OdontoImagemCategoria,
} from "@/lib/odonto-imagens";

interface Props {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  pacienteId: string;
  criadoPor: string | null;
  onUploaded: () => void;
  denteSugerido?: number | null;
}

export function UploadImagemDialog({
  open,
  onClose,
  clinicaId,
  pacienteId,
  criadoPor,
  onUploaded,
  denteSugerido,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [categoria, setCategoria] = useState<OdontoImagemCategoria>("foto_documentacao");
  const [dataExame, setDataExame] = useState(new Date().toISOString().slice(0, 10));
  const [dentesStr, setDentesStr] = useState(denteSugerido ? String(denteSugerido) : "");
  const [descricao, setDescricao] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);

  function reset() {
    setFiles([]);
    setCategoria("foto_documentacao");
    setDataExame(new Date().toISOString().slice(0, 10));
    setDentesStr(denteSugerido ? String(denteSugerido) : "");
    setDescricao("");
    setTagsStr("");
    setProgresso(null);
  }

  async function enviar() {
    if (files.length === 0) {
      toast.error("Selecione ao menos um arquivo.");
      return;
    }
    const dentes = dentesStr
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const tags = tagsStr
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setEnviando(true);
    setProgresso({ atual: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        setProgresso({ atual: i + 1, total: files.length });
        await uploadOdontoImagem({
          clinicaId,
          pacienteId,
          file: files[i],
          categoria,
          dataExame,
          dentes,
          descricao: descricao || null,
          tags,
          criadoPor,
        });
      }
      toast.success(`${files.length} imagem(ns) enviada(s).`);
      onUploaded();
      reset();
      onClose();
    } catch (e) {
      mostrarErro(e, "Falha ao enviar imagem");
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !enviando && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar imagens</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Arquivos (JPG, PNG, WEBP, PDF ou DICOM)</Label>
            <Input
              type="file"
              accept="image/*,application/pdf,application/dicom"
              multiple
              disabled={enviando}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {files.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
                  >
                    {f.name}
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as OdontoImagemCategoria)}
                disabled={enviando}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORIA_LABEL) as OdontoImagemCategoria[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORIA_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data do exame</Label>
              <Input
                type="date"
                value={dataExame}
                onChange={(e) => setDataExame(e.target.value)}
                disabled={enviando}
              />
            </div>
          </div>

          <div>
            <Label>Dentes vinculados (opcional)</Label>
            <Input
              placeholder="Ex.: 11, 12, 21"
              value={dentesStr}
              onChange={(e) => setDentesStr(e.target.value)}
              disabled={enviando}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Números FDI separados por vírgula ou espaço.
            </p>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              disabled={enviando}
            />
          </div>

          <div>
            <Label>Tags (opcional)</Label>
            <Input
              placeholder="Ex.: pré-tratamento; canal"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              disabled={enviando}
            />
          </div>

          {progresso && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando {progresso.atual}/{progresso.total}…
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || files.length === 0}>
            {enviando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}