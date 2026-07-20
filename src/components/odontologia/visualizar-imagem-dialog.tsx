import { useEffect, useState } from "react";
import { Trash2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDatePura } from "@/lib/date-utils";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  atualizarOdontoImagem,
  softDeleteOdontoImagem,
  urlAssinada,
  CATEGORIA_LABEL,
  type OdontoImagem,
  type OdontoImagemCategoria,
} from "@/lib/odonto-imagens";

interface Props {
  open: boolean;
  onClose: () => void;
  imagem: OdontoImagem | null;
  onChanged: () => void;
  readOnly?: boolean;
}

export function VisualizarImagemDialog({ open, onClose, imagem, onChanged, readOnly }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<OdontoImagemCategoria>("foto_documentacao");
  const [dataExame, setDataExame] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dentesStr, setDentesStr] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (!imagem) return;
    setCategoria(imagem.categoria);
    setDataExame(imagem.data_exame);
    setDescricao(imagem.descricao ?? "");
    setDentesStr((imagem.dentes ?? []).join(", "));
    void urlAssinada(imagem.storage_path).then(setUrl);
  }, [imagem]);

  async function salvar() {
    if (!imagem) return;
    setSalvando(true);
    try {
      const dentes = dentesStr
        .split(/[,\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      await atualizarOdontoImagem(imagem.id, {
        categoria,
        data_exame: dataExame,
        descricao: descricao || null,
        dentes,
      });
      toast.success("Imagem atualizada.");
      onChanged();
      onClose();
    } catch (e) {
      mostrarErro(e, "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!imagem) return;
    if (!confirm("Confirmar exclusão desta imagem? Ela ficará arquivada no histórico.")) return;
    setExcluindo(true);
    try {
      await softDeleteOdontoImagem(imagem.id);
      toast.success("Imagem removida.");
      onChanged();
      onClose();
    } catch (e) {
      mostrarErro(e, "Falha ao excluir");
    } finally {
      setExcluindo(false);
    }
  }

  if (!imagem) return null;
  const ehImagem = /^image\//i.test(imagem.mime_type);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{CATEGORIA_LABEL[imagem.categoria]}</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-muted/40 rounded-md flex items-center justify-center min-h-[300px] overflow-auto">
            {!url ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : ehImagem ? (
              <img src={url} alt="" className="max-w-full max-h-[70vh] object-contain" />
            ) : (
              <a href={url} target="_blank" rel="noreferrer" className="text-primary underline p-4">
                Abrir arquivo ({imagem.mime_type})
              </a>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Enviado em {formatDatePura(imagem.created_at.slice(0, 10))}
              {imagem.tamanho_bytes ? ` · ${(imagem.tamanho_bytes / 1024).toFixed(0)} KB` : ""}
              {imagem.largura ? ` · ${imagem.largura}×${imagem.altura}` : ""}
            </div>

            <div>
              <Label>Categoria</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as OdontoImagemCategoria)}
                disabled={readOnly}
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
                disabled={readOnly}
              />
            </div>

            <div>
              <Label>Dentes vinculados</Label>
              <Input
                value={dentesStr}
                onChange={(e) => setDentesStr(e.target.value)}
                placeholder="Ex.: 11, 12"
                disabled={readOnly}
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                disabled={readOnly}
              />
            </div>

            {imagem.tags.length > 0 && (
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {imagem.tags.map((t) => (
                    <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {!readOnly ? (
            <Button
              variant="destructive"
              onClick={excluir}
              disabled={excluindo || salvando}
            >
              {excluindo ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
            {!readOnly && (
              <Button onClick={salvar} disabled={salvando || excluindo}>
                {salvando ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}