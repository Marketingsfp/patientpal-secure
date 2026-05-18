import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, FileText, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/financeiro/notas")({
  component: Page,
  head: () => ({ meta: [{ title: "Notas Pacientes — Financeiro" }] }),
});

interface Nota {
  id: string; numero: string | null; serie: string | null; data_emissao: string;
  valor: number; status: string; url_pdf: string | null; observacoes: string | null;
  paciente_id: string | null;
}
interface Pac { id: string; nome: string }
const EMPTY = {
  numero: "", serie: "", data_emissao: new Date().toISOString().slice(0, 10), valor: "",
  status: "emitida", url_pdf: "", paciente_id: "", observacoes: "",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Nota[]>([]);
  const [pacientes, setPacientes] = useState<Pac[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Nota | null>(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("fin_notas_pacientes")
      .select("id, numero, serie, data_emissao, valor, status, url_pdf, observacoes, paciente_id")
      .eq("clinica_id", clinicaAtual.clinica_id).order("data_emissao", { ascending: false }).limit(200);
    if (error) toast.error(error.message); else setItems((data ?? []) as Nota[]);
    setLoading(false);
  };
  const loadPac = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase.from("pacientes").select("id, nome")
      .eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500);
    setPacientes((data ?? []) as Pac[]);
  };
  useEffect(() => { void load(); void loadPac(); }, [clinicaAtual?.clinica_id]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (n: Nota) => { setEditing(n); setForm({
    numero: n.numero ?? "", serie: n.serie ?? "", data_emissao: n.data_emissao, valor: String(n.valor),
    status: n.status, url_pdf: n.url_pdf ?? "", paciente_id: n.paciente_id ?? "", observacoes: n.observacoes ?? "",
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id, numero: form.numero || null, serie: form.serie || null,
      data_emissao: form.data_emissao, valor: Number(form.valor), status: form.status,
      url_pdf: form.url_pdf || null, paciente_id: form.paciente_id || null, observacoes: form.observacoes || null,
    };
    const { error } = editing
      ? await supabase.from("fin_notas_pacientes").update(payload).eq("id", editing.id)
      : await supabase.from("fin_notas_pacientes").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const remove = async (n: Nota) => {
    if (!confirm(`Excluir nota ${n.numero ?? ""}?`)) return;
    const { error } = await supabase.from("fin_notas_pacientes").delete().eq("id", n.id);
    if (error) toast.error(error.message); else { toast.success("Removida"); await load(); }
  };
  const pacMap = new Map(pacientes.map((p) => [p.id, p.nome]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Notas dos pacientes</h1>
          <p className="text-sm text-muted-foreground">Registro e controle de NFs emitidas</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Nova nota</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} nota</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Número</Label>
                  <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
                <div className="space-y-2"><Label>Série</Label>
                  <Input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} /></div>
                <div className="space-y-2"><Label>Data</Label>
                  <Input type="date" required value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Valor *</Label>
                  <CurrencyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="emitida">Emitida</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
              <div className="space-y-2"><Label>Paciente</Label>
                <Select value={form.paciente_id || "none"} onValueChange={(v) => setForm({ ...form, paciente_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>URL do PDF</Label>
                <Input type="url" value={form.url_pdf} onChange={(e) => setForm({ ...form, url_pdf: e.target.value })} placeholder="https://..." /></div>
              <div className="space-y-2"><Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          : items.length === 0 ? <div className="py-12 text-center text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />Nenhuma nota emitida.</div>
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Número/Série</TableHead>
              <TableHead>Paciente</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead className="w-32"></TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="text-sm">{new Date(n.data_emissao).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="text-sm">{n.numero ?? "—"} {n.serie && `/ ${n.serie}`}</TableCell>
                <TableCell className="text-sm">{n.paciente_id ? pacMap.get(n.paciente_id) ?? "—" : "—"}</TableCell>
                <TableCell><Badge variant={n.status === "emitida" ? "default" : "secondary"}>{n.status}</Badge></TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(n.valor))}</TableCell>
                <TableCell className="text-right">
                  {n.url_pdf && <a href={n.url_pdf} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="icon"><ExternalLink className="h-3.5 w-3.5" /></Button></a>}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(n)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(n)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}
