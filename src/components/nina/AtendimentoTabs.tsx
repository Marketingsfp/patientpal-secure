import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/lib/confirm";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Zap,
} from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import {
  listarMacros,
  salvarMacro,
  excluirMacro,
} from "@/lib/atendimento.functions";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";


/* ============================================================
 * MACROS
 * ========================================================== */
export function AtendMacros() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarMacros);
  const salvar = useServerFn(salvarMacro);
  const excluir = useServerFn(excluirMacro);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setRows(await listar({ data: { clinicaId } }));
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, listar]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  useRealtimeRefresh(["atend_macros"], carregar, !!clinicaId);

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clinicaId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await salvar({
        data: {
          clinicaId,
          id: edit?.id,
          atalho: String(fd.get("atalho") || ""),
          titulo: String(fd.get("titulo") || ""),
          conteudo: String(fd.get("conteudo") || ""),
          ativo: fd.get("ativo") === "on",
        },
      });
      toast.success("Macro salva");
      setOpen(false);
      setEdit(null);
      await carregar();
    } catch (err: any) {
      mostrarErro(err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" /> Macros / Respostas Rápidas
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma macro. Use no chat com /atalho.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between rounded-lg border p-3 gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/{r.atalho}</code>
                <span className="font-medium truncate">{r.titulo}</span>
                {!r.ativo && <Badge variant="outline">Inativa</Badge>}
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2 mt-1">
                {r.conteudo}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEdit(r);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  if (!(await confirmDialog("Excluir macro?"))) return;
                  try {
                    await excluir({ data: { clinicaId: clinicaId!, id: r.id } });
                    await carregar();
                    toast.success("Excluída");
                  } catch (e: any) {
                    mostrarErro(e);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Editar" : "Nova"} macro</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvar} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label>Atalho *</Label>
                <Input
                  name="atalho"
                  defaultValue={edit?.atalho ?? ""}
                  required
                  maxLength={40}
                  placeholder="ola"
                  pattern="[a-zA-Z0-9_-]+"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Título *</Label>
                <Input name="titulo" defaultValue={edit?.titulo ?? ""} required maxLength={120} />
              </div>
            </div>
            <div>
              <Label>Conteúdo *</Label>
              <Textarea
                name="conteudo"
                defaultValue={edit?.conteudo ?? ""}
                required
                maxLength={4000}
                rows={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch name="ativo" defaultChecked={edit?.ativo ?? true} />
              <Label>Ativa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}



