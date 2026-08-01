import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Sparkles, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/financeiro/regras-ia")({
  component: Page,
  head: () => ({ meta: [{ title: "Regras IA — Financeiro" }] }),
});

interface Regra {
  id: string; nome: string; padrao_descricao: string | null; categoria_id: string | null;
  prioridade: number; ativo: boolean;
}
interface Cat { id: string; nome: string; tipo: string }
const EMPTY = { nome: "", padrao_descricao: "", categoria_id: "", prioridade: "0" };

function Page() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Regra[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Regra | null>(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const [r, c] = await Promise.all([
      supabase.from("fin_regras_ia").select("id, nome, padrao_descricao, categoria_id, prioridade, ativo")
        .eq("clinica_id", clinicaAtual.clinica_id).order("prioridade", { ascending: false }),
      supabase.from("fin_categorias").select("id, nome, tipo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
    ]);
    if (r.error) mostrarErro(r.error); else setItems((r.data ?? []) as Regra[]);
    setCats((c.data ?? []) as Cat[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (r: Regra) => { setEditing(r); setForm({
    nome: r.nome, padrao_descricao: r.padrao_descricao ?? "",
    categoria_id: r.categoria_id ?? "", prioridade: String(r.prioridade),
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id, nome: form.nome.trim(),
      padrao_descricao: form.padrao_descricao.trim() || null,
      categoria_id: form.categoria_id || null, prioridade: Number(form.prioridade || 0),
    };
    const { error } = editing
      ? await supabase.from("fin_regras_ia").update(payload).eq("id", editing.id)
      : await supabase.from("fin_regras_ia").insert(payload);
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const toggle = async (r: Regra) => {
    const { error } = await supabase.from("fin_regras_ia").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) mostrarErro(error); else await load();
  };
  const remove = async (r: Regra) => {
    if (!confirm(`Excluir "${r.nome}"?`)) return;
    const { error } = await supabase.from("fin_regras_ia").delete().eq("id", r.id);
    if (error) mostrarErro(error); else { toast.success("Removida"); await load(); }
  };
  const catMap = new Map(cats.map((c) => [c.id, c.nome]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" />Regras de IA</h1>
          <p className="text-sm text-muted-foreground">Categorização automática de lançamentos por padrão</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Nova regra</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} regra</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label>
                <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Aluguel" /></div>
              <div className="space-y-2"><Label>Padrão na descrição</Label>
                <Input value={form.padrao_descricao} onChange={(e) => setForm({ ...form, padrao_descricao: e.target.value })} placeholder="Ex.: aluguel, locação" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Categoria</Label>
                  <Select value={form.categoria_id || "none"} onValueChange={(v) => setForm({ ...form, categoria_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome} ({c.tipo})</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <div className="space-y-2"><Label>Prioridade</Label>
                  <Input type="number" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} /></div>
              </div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {loading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent></Card>
        : items.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma regra cadastrada.</CardContent></Card>
        : <div className="space-y-2">{items.map((r) => (
          <Card key={r.id} className={r.ativo ? "" : "opacity-50"}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{r.nome}</p>
                {r.padrao_descricao && <p className="text-xs text-muted-foreground">Quando contém: "{r.padrao_descricao}"</p>}
              </div>
              {r.categoria_id && <Badge variant="secondary">{catMap.get(r.categoria_id)}</Badge>}
              <Badge variant="outline">Prio. {r.prioridade}</Badge>
              <Button variant="ghost" size="sm" onClick={() => toggle(r)}>{r.ativo ? "Ativa" : "Inativa"}</Button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </CardContent>
          </Card>))}</div>}
    </div>
  );
}
