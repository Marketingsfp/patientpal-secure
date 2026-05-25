import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/beneficios")({
  component: BeneficiosPage,
  head: () => ({ meta: [{ title: "Benefícios — Cartão Benefícios" }] }),
});

type Convenio = { id: string; nome: string; ativo: boolean };
type Beneficio = {
  id: string;
  clinica_id: string;
  convenio_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
};

function BeneficiosPage() {
  const { clinicaAtual } = useClinica();
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [rows, setRows] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroConvenio, setFiltroConvenio] = useState<string>("todos");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Beneficio | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [convenioId, setConvenioId] = useState<string>("");
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Beneficio | null>(null);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const cid = clinicaAtual.clinica_id;
    const [cs, bs] = await Promise.all([
      supabase.from("cb_convenios").select("id, nome, ativo").eq("clinica_id", cid).order("nome"),
      supabase.from("cb_beneficios").select("id, clinica_id, convenio_id, nome, descricao, ativo").eq("clinica_id", cid).order("nome"),
    ]);
    if (cs.error) toast.error(cs.error.message);
    if (bs.error) toast.error(bs.error.message);
    setConvenios((cs.data ?? []) as Convenio[]);
    setRows((bs.data ?? []) as Beneficio[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const convMap = useMemo(() => {
    const m = new Map<string, string>();
    convenios.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [convenios]);

  const filtered = useMemo(
    () => (filtroConvenio === "todos" ? rows : rows.filter((b) => b.convenio_id === filtroConvenio)),
    [rows, filtroConvenio],
  );

  const openNew = () => {
    if (convenios.length === 0) {
      toast.error("Cadastre um convênio primeiro.");
      return;
    }
    setEditing(null);
    setNome(""); setDescricao(""); setAtivo(true);
    setConvenioId(convenios[0]?.id ?? "");
    setOpen(true);
  };

  const openEdit = (b: Beneficio) => {
    setEditing(b);
    setNome(b.nome);
    setDescricao(b.descricao ?? "");
    setConvenioId(b.convenio_id);
    setAtivo(b.ativo);
    setOpen(true);
  };

  const save = async () => {
    if (!clinicaAtual) return;
    if (!nome.trim()) { toast.error("Informe o nome."); return; }
    if (!convenioId) { toast.error("Selecione um convênio."); return; }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      convenio_id: convenioId,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      ativo,
    };
    const { error } = editing
      ? await supabase.from("cb_beneficios").update(payload).eq("id", editing.id)
      : await supabase.from("cb_beneficios").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Benefício atualizado." : "Benefício criado.");
    setOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("cb_beneficios").delete().eq("id", toDelete.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Benefício excluído.");
    setToDelete(null);
    load();
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Gift className="h-4 w-4" />
          Benefícios oferecidos pelos cartões da clínica.
        </p>
        <div className="flex items-center gap-2">
          <Select value={filtroConvenio} onValueChange={setFiltroConvenio}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar por convênio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os convênios</SelectItem>
              {convenios.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo benefício</Button>
        </div>
      </div>

      {convenios.length === 0 && !loading ? (
        <Card><CardContent className="p-4 text-sm">
          Nenhum convênio cadastrado.{" "}
          <Link to="/app/cartao-beneficios/convenios" className="text-primary underline">Cadastrar agora</Link>.
        </CardContent></Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Convênio</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum benefício encontrado.</TableCell></TableRow>
              ) : filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.nome}</TableCell>
                  <TableCell><Badge variant="outline">{convMap.get(b.convenio_id) ?? "—"}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{b.descricao ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={b.ativo ? "default" : "outline"}>{b.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setToDelete(b)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar benefício" : "Novo benefício"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Consulta gratuita" />
            </div>
            <div>
              <Label>Convênio *</Label>
              <Select value={convenioId} onValueChange={setConvenioId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir benefício?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}