import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Search, Pencil, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/procedimentos")({
  component: ProcedimentosPage,
  head: () => ({ meta: [{ title: "Procedimentos — ClinicaOS" }] }),
});

type Tipo = "consulta" | "exame" | "procedimento";
interface Procedimento {
  id: string;
  nome: string;
  tipo: Tipo;
  codigo: string | null;
  valor_padrao: number;
  duracao_minutos: number;
  observacoes: string | null;
  ativo: boolean;
}

const TIPO_LABEL: Record<Tipo, string> = {
  consulta: "Consulta",
  exame: "Exame",
  procedimento: "Procedimento",
};
const TIPO_COR: Record<Tipo, string> = {
  consulta: "bg-primary/10 text-primary",
  exame: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  procedimento: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

const EMPTY = {
  nome: "", tipo: "consulta" as Tipo, codigo: "",
  valor_padrao: "0", duracao_minutos: "30", observacoes: "", ativo: true,
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ProcedimentosPage() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Procedimento[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | Tipo>("todos");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Procedimento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("procedimentos")
      .select("id, nome, tipo, codigo, valor_padrao, duracao_minutos, observacoes, ativo")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Procedimento[]);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter(p => {
      if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
      if (q && !p.nome.toLowerCase().includes(q) && !(p.codigo ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, busca, filtroTipo]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (p: Procedimento) => {
    setEditing(p);
    setForm({
      nome: p.nome, tipo: p.tipo, codigo: p.codigo ?? "",
      valor_padrao: String(p.valor_padrao), duracao_minutos: String(p.duracao_minutos),
      observacoes: p.observacoes ?? "", ativo: p.ativo,
    });
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!form.nome.trim()) { toast.error("Informe o nome."); return; }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome.trim(),
      tipo: form.tipo,
      codigo: form.codigo.trim() || null,
      valor_padrao: Number(form.valor_padrao) || 0,
      duracao_minutos: Math.max(0, Number(form.duracao_minutos) || 0),
      observacoes: form.observacoes.trim() || null,
      ativo: form.ativo,
    };
    const { error } = editing
      ? await supabase.from("procedimentos").update(payload).eq("id", editing.id)
      : await supabase.from("procedimentos").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Atualizado." : "Cadastrado.");
    setOpen(false);
    void load();
  };

  const onDelete = async (p: Procedimento) => {
    if (!confirm(`Excluir ${p.nome}?`)) return;
    const { error } = await supabase.from("procedimentos").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído.");
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Procedimentos
          </h1>
          <p className="text-sm text-muted-foreground">Cadastre consultas, exames e procedimentos oferecidos pela clínica.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo</Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou código…" className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as typeof filtroTipo)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="consulta">Consulta</SelectItem>
            <SelectItem value="exame">Exame</SelectItem>
            <SelectItem value="procedimento">Procedimento</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Nome</TableHead>
              <TableHead className="w-28">Tipo</TableHead>
              <TableHead className="w-24">Código</TableHead>
              <TableHead className="w-28 text-right">Valor</TableHead>
              <TableHead className="w-24 text-right">Duração</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !clinicaAtual ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum procedimento cadastrado.</TableCell></TableRow>
            ) : filtrados.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_COR[p.tipo]}`}>{TIPO_LABEL[p.tipo]}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.codigo ?? "—"}</TableCell>
                <TableCell className="text-right text-sm">{fmtBRL(Number(p.valor_padrao))}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{p.duracao_minutos} min</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Código</Label>
                <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ex.: TUSS" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consulta">Consulta</SelectItem>
                    <SelectItem value="exame">Exame</SelectItem>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Valor padrão (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.valor_padrao} onChange={(e) => setForm({ ...form, valor_padrao: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Duração (min)</Label>
                <Input type="number" min="0" value={form.duracao_minutos} onChange={(e) => setForm({ ...form, duracao_minutos: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} />
              Ativo
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
