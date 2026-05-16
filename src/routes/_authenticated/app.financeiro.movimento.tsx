import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/financeiro/movimento")({
  component: Page,
  head: () => ({ meta: [{ title: "Movimento — Financeiro" }] }),
});

interface Lanc {
  id: string; tipo: "receita" | "despesa"; descricao: string; valor: number;
  data: string; status: string; categoria_id: string | null; conta_id: string | null;
  forma_pagamento: string | null;
}
interface Opt { id: string; nome: string; tipo?: string }

const EMPTY = {
  tipo: "receita" as "receita" | "despesa", descricao: "", valor: "", data: new Date().toISOString().slice(0, 10),
  status: "confirmado", categoria_id: "", conta_id: "", forma_pagamento: "", observacoes: "",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Lanc[]>([]);
  const [cats, setCats] = useState<Opt[]>([]);
  const [contas, setContas] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Lanc | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [filterTipo, setFilterTipo] = useState<"todos" | "receita" | "despesa">("todos");
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase.from("fin_lancamentos")
      .select("id, tipo, descricao, valor, data, status, categoria_id, conta_id, forma_pagamento")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("data", fromDate).lte("data", toDate)
      .order("data", { ascending: false });
    if (filterTipo !== "todos") q = q.eq("tipo", filterTipo);
    const { data, error } = await q;
    if (error) toast.error(error.message); else setItems((data ?? []) as Lanc[]);
    setLoading(false);
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const [c, b] = await Promise.all([
      supabase.from("fin_categorias").select("id, nome, tipo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("fin_contas").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
    ]);
    setCats((c.data ?? []) as Opt[]); setContas((b.data ?? []) as Opt[]);
  };
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id, filterTipo, fromDate, toDate]);
  useEffect(() => { void loadOpts(); }, [clinicaAtual?.clinica_id]);

  const totais = useMemo(() => {
    let r = 0, d = 0;
    for (const i of items) { if (i.tipo === "receita") r += Number(i.valor); else d += Number(i.valor); }
    return { r, d, saldo: r - d };
  }, [items]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (l: Lanc) => { setEditing(l); setForm({
    tipo: l.tipo, descricao: l.descricao, valor: String(l.valor), data: l.data, status: l.status,
    categoria_id: l.categoria_id ?? "", conta_id: l.conta_id ?? "",
    forma_pagamento: l.forma_pagamento ?? "", observacoes: "",
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id, tipo: form.tipo, descricao: form.descricao.trim(),
      valor: Number(form.valor), data: form.data, status: form.status as "cancelado" | "confirmado" | "pendente",
      categoria_id: form.categoria_id || null, conta_id: form.conta_id || null,
      forma_pagamento: form.forma_pagamento || null, observacoes: form.observacoes || null,
    };
    const { error } = editing
      ? await supabase.from("fin_lancamentos").update(payload).eq("id", editing.id)
      : await supabase.from("fin_lancamentos").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const remove = async (l: Lanc) => {
    if (!confirm(`Excluir "${l.descricao}"?`)) return;
    const { error } = await supabase.from("fin_lancamentos").delete().eq("id", l.id);
    if (error) toast.error(error.message); else { toast.success("Removido"); await load(); }
  };

  const catsFiltradas = cats.filter((c) => !c.tipo || c.tipo === form.tipo);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-semibold">Movimento de Caixa</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas do período</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Novo lançamento</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} lançamento</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "receita" | "despesa", categoria_id: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                    </SelectContent>
                  </Select></div>
                <div className="space-y-2"><Label>Data</Label>
                  <Input type="date" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Descrição *</Label>
                <Input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" required value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Categoria</Label>
                  <Select value={form.categoria_id || "none"} onValueChange={(v) => setForm({ ...form, categoria_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {catsFiltradas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <div className="space-y-2"><Label>Conta</Label>
                  <Select value={form.conta_id || "none"} onValueChange={(v) => setForm({ ...form, conta_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
              </div>
              <div className="space-y-2"><Label>Forma de pagamento</Label>
                <Input value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} placeholder="Pix, cartão, dinheiro..." /></div>
              <div className="space-y-2"><Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Receitas</p><p className="text-2xl font-semibold text-green-600">{fmt(totais.r)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Despesas</p><p className="text-2xl font-semibold text-red-600">{fmt(totais.d)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Saldo</p><p className={`text-2xl font-semibold ${totais.saldo >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(totais.saldo)}</p></CardContent></Card>
      </div>

      <Card><CardContent className="pt-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">De</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label className="text-xs">Até</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label className="text-xs">Tipo</Label>
          <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v as typeof filterTipo)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="receita">Receitas</SelectItem>
              <SelectItem value="despesa">Despesas</SelectItem>
            </SelectContent>
          </Select></div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          : items.length === 0 ? <div className="py-12 text-center text-muted-foreground">Nenhum lançamento no período.</div>
          : <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.tipo === "receita"
                  ? <ArrowUpCircle className="h-4 w-4 text-green-600" />
                  : <ArrowDownCircle className="h-4 w-4 text-red-600" />}</TableCell>
                <TableCell className="text-sm">{new Date(l.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{l.descricao}</TableCell>
                <TableCell><Badge variant={l.status === "confirmado" ? "default" : "secondary"}>{l.status}</Badge></TableCell>
                <TableCell className={`text-right font-medium ${l.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                  {l.tipo === "receita" ? "+" : "-"} {fmt(Number(l.valor))}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(l)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}
