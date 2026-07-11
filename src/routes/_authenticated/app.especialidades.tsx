import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SERVICOS_TABS, SERVICOS_META } from "@/components/section-tabs";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/_authenticated/app/especialidades")({
  component: EspecialidadesPageWithTabs,
  head: () => ({ meta: [{ title: "Especialidades — ClinicaOS" }] }),
});

interface Esp { id: string; nome: string; descricao: string | null; ativo: boolean }

function EspecialidadesPage() {
  const podeEscrever = usePodeEscrever("especialidades");
  const [rows, setRows] = useState<Esp[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "ativo" | "inativo">("todos");
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
    if (error) mostrarErro(error);
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
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
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
    if (error) { mostrarErro(error); return; }
    toast.success(editing ? "Especialidade atualizada" : "Especialidade criada");
    setOpen(false);
    void load();
  }

  const filtered = rows.filter(r => {
    const matchNome = r.nome.toLowerCase().includes(q.toLowerCase());
    const matchStatus =
      statusFiltro === "todos" ||
      (statusFiltro === "ativo" && r.ativo) ||
      (statusFiltro === "inativo" && !r.ativo);
    return matchNome && matchStatus;
  });

  async function confirmarExclusao() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!toDelete) return;
    setDeleting(true);
    const { data: vinculos, error: countError } = await supabase
      .from("procedimentos")
      .select("clinica_id")
      .ilike("grupo", toDelete.nome);
    if (countError) { setDeleting(false); mostrarErro(countError); return; }
    if ((vinculos?.length ?? 0) > 0) {
      setDeleting(false);
      const clinicaIds = Array.from(new Set(
        (vinculos ?? []).map((v: any) => v.clinica_id).filter(Boolean)
      ));
      let nomes: string[] = [];
      if (clinicaIds.length > 0) {
        const { data: clins } = await supabase
          .from("clinicas")
          .select("nome")
          .in("id", clinicaIds);
        nomes = (clins ?? []).map((c: any) => c.nome).filter(Boolean);
      }
      const detalhe = nomes.length
        ? ` (clínica(s): ${nomes.join(", ")})`
        : "";
      toast.error(
        `Não é possível excluir: existem ${vinculos!.length} serviço(s) vinculados a esta especialidade${detalhe}. Especialidades são globais — remova os serviços em todas as clínicas antes.`,
        { duration: 8000 }
      );
      setToDelete(null);
      return;
    }
    // Verificar médicos vinculados
    const { data: medVinc, error: medErr } = await supabase
      .from("medicos")
      .select("nome")
      .eq("especialidade_id", toDelete.id);
    if (medErr) { setDeleting(false); mostrarErro(medErr); return; }
    if ((medVinc?.length ?? 0) > 0) {
      setDeleting(false);
      const nomes = (medVinc ?? []).map((m: any) => m.nome).filter(Boolean).slice(0, 5);
      const extra = (medVinc!.length > 5) ? ` e mais ${medVinc!.length - 5}` : "";
      toast.error(
        `Não é possível excluir: ${medVinc!.length} médico(s) vinculado(s) a esta especialidade (${nomes.join(", ")}${extra}). Altere a especialidade desses médicos antes.`,
        { duration: 8000 }
      );
      setToDelete(null);
      return;
    }
    const { error, count: delCount } = await supabase
      .from("especialidades")
      .delete({ count: "exact" })
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) { mostrarErro(error); return; }
    if (!delCount) {
      toast.error("Não foi possível excluir. Verifique se você tem permissão.");
      return;
    }
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
        {podeEscrever && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova</Button>
        )}
      </div>

      <Card className="p-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(qInput); }}>
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar..." value={qInput} onChange={e => setQInput(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary"><Search className="h-4 w-4 mr-1" /> Buscar</Button>
          <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as "todos" | "ativo" | "inativo")}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Situação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </form>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-32">Situação</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
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
                  <div className="flex items-center justify-end gap-1">
                    {podeEscrever && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setToDelete(r)} aria-label="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
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
