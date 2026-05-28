import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SERVICOS_TABS, SERVICOS_META } from "@/components/section-tabs";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stethoscope, Plus, Pencil, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/especialidades")({
  component: EspecialidadesPageWithTabs,
  head: () => ({ meta: [{ title: "Especialidades — ClinicaOS" }] }),
});

interface Esp { id: string; nome: string; descricao: string | null; ativo: boolean }

function EspecialidadesPage() {
  const [rows, setRows] = useState<Esp[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Esp | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", ativo: true });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Esp | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("especialidades")
      .select("id,nome,descricao,ativo")
      .order("nome");
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Esp[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ nome: "", descricao: "", ativo: true });
    setOpen(true);
  }
  function openEdit(e: Esp) {
    setEditing(e);
    setForm({ nome: e.nome, descricao: e.descricao ?? "", ativo: e.ativo });
    setOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    const toTitle = (s: string) =>
      s
        .toLocaleLowerCase("pt-BR")
        .split(/(\s+|-)/)
        .map((part) =>
          /^\s+$|^-$/.test(part)
            ? part
            : part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1),
        )
        .join("");
    const payload = {
      nome: toTitle(form.nome.trim()),
      descricao: form.descricao.trim() || null,
      ativo: form.ativo,
    };
    const { error } = editing
      ? await supabase.from("especialidades").update(payload).eq("id", editing.id)
      : await supabase.from("especialidades").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Especialidade atualizada" : "Especialidade criada");
    setOpen(false);
    void load();
  }

  const filtered = rows.filter(r => r.nome.toLowerCase().includes(q.toLowerCase()));

  async function confirmarExclusao() {
    if (!toDelete) return;
    setDeleting(true);
    const { count, error: countError } = await supabase
      .from("procedimentos")
      .select("id", { count: "exact", head: true })
      .eq("grupo", toDelete.nome);
    if (countError) { setDeleting(false); toast.error(countError.message); return; }
    if ((count ?? 0) > 0) {
      setDeleting(false);
      toast.error(`Não é possível excluir: existem ${count} serviço(s) vinculados a esta especialidade.`);
      setToDelete(null);
      return;
    }
    const { error } = await supabase.from("especialidades").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Especialidade excluída");
    setToDelete(null);
    void load();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Stethoscope className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Especialidades</h1>
          <p className="text-sm text-muted-foreground">Cadastro global de especialidades médicas.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova</Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-32">Situação</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma especialidade.</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.ativo ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {r.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(r)} aria-label="Excluir">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar especialidade" : "Nova especialidade"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Hepatologia" />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
              Ativo
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir especialidade</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{toDelete?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmarExclusao(); }} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function EspecialidadesPageWithTabs() {
  return (
    <>
      <SectionTabs title={SERVICOS_META.title} icon={SERVICOS_META.icon} tabs={SERVICOS_TABS} />
      <EspecialidadesPage />
    </>
  );
}
