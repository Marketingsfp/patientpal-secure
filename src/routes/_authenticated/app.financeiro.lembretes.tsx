import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Bell, Trash2, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/financeiro/lembretes")({
  component: Page,
  head: () => ({ meta: [{ title: "Lembretes — Financeiro" }] }),
});

interface Lemb {
  id: string; titulo: string; descricao: string | null; data_lembrete: string;
  prioridade: string; concluido: boolean;
}
const EMPTY = { titulo: "", descricao: "", data_lembrete: new Date().toISOString().slice(0, 10), prioridade: "media" };

function Page() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Lemb[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Lemb | null>(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("fin_lembretes")
      .select("id, titulo, descricao, data_lembrete, prioridade, concluido")
      .eq("clinica_id", clinicaAtual.clinica_id).order("concluido").order("data_lembrete");
    if (error) mostrarErro(error); else setItems((data ?? []) as Lemb[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (l: Lemb) => { setEditing(l); setForm({
    titulo: l.titulo, descricao: l.descricao ?? "", data_lembrete: l.data_lembrete, prioridade: l.prioridade,
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = { clinica_id: clinicaAtual.clinica_id, titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null, data_lembrete: form.data_lembrete, prioridade: form.prioridade };
    const { error } = editing
      ? await supabase.from("fin_lembretes").update(payload).eq("id", editing.id)
      : await supabase.from("fin_lembretes").insert(payload);
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const toggle = async (l: Lemb) => {
    const { error } = await supabase.from("fin_lembretes").update({ concluido: !l.concluido }).eq("id", l.id);
    if (error) mostrarErro(error); else await load();
  };
  const remove = async (l: Lemb) => {
    if (!confirm(`Excluir "${l.titulo}"?`)) return;
    const { error } = await supabase.from("fin_lembretes").delete().eq("id", l.id);
    if (error) mostrarErro(error); else { toast.success("Removido"); await load(); }
  };

  const prioColor = (p: string) => p === "alta" ? "destructive" : p === "baixa" ? "secondary" : "default";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Lembretes</h1>
          <p className="text-sm text-muted-foreground">Vencimentos e tarefas financeiras</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Novo lembrete</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} lembrete</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label>Título *</Label>
                <Input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
              <div className="space-y-2"><Label>Descrição</Label>
                <Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Data</Label>
                  <Input type="date" required value={form.data_lembrete} onChange={(e) => setForm({ ...form, data_lembrete: e.target.value })} /></div>
                <div className="space-y-2"><Label>Prioridade</Label>
                  <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {loading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent></Card>
        : items.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum lembrete.</CardContent></Card>
        : <div className="space-y-2">{items.map((l) => (
          <Card key={l.id} className={l.concluido ? "opacity-60" : ""}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => toggle(l)}>
                <CheckCircle2 className={`h-5 w-5 ${l.concluido ? "text-green-600" : "text-muted-foreground"}`} />
              </Button>
              <Bell className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${l.concluido ? "line-through" : ""}`}>{l.titulo}</p>
                {l.descricao && <p className="text-sm text-muted-foreground truncate">{l.descricao}</p>}
              </div>
              <Badge variant={prioColor(l.prioridade) as "default" | "secondary" | "destructive"}>{l.prioridade}</Badge>
              <span className="text-sm text-muted-foreground">{new Date(l.data_lembrete).toLocaleDateString("pt-BR")}</span>
              <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(l)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </CardContent>
          </Card>))}
        </div>}
    </div>
  );
}
