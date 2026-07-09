import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  forma_pagamento: string | null; criado_por: string | null;
}
interface Opt { id: string; nome: string; tipo?: string }

const EMPTY = {
  tipo: "receita" as "receita" | "despesa", descricao: "", valor: "", data: new Date().toISOString().slice(0, 10),
  status: "confirmado", categoria_id: "", conta_id: "", forma_pagamento: "", observacoes: "",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("financeiro");
  const [items, setItems] = useState<Lanc[]>([]);
  const [cats, setCats] = useState<Opt[]>([]);
  const [contas, setContas] = useState<Opt[]>([]);
  const [usuarios, setUsuarios] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Lanc | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [filterTipo, setFilterTipo] = useState<"todos" | "receita" | "despesa">("todos");
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [detalhe, setDetalhe] = useState<null | "receita" | "despesa" | "saldo">(null);
  const [resumo, setResumo] = useState<{ r: number; d: number; saldo: number; totalRows: number }>({ r: 0, d: 0, saldo: 0, totalRows: 0 });
  const [filterStatus, setFilterStatus] = useState<"confirmado" | "todos" | "pendente">("confirmado");
  const [filterUsuario, setFilterUsuario] = useState<string>("todos");

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase.from("fin_lancamentos")
      .select("id, tipo, descricao, valor, data, status, categoria_id, conta_id, forma_pagamento, criado_por")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("data", fromDate).lte("data", toDate)
      .order("data", { ascending: false })
      .range(0, 499);
    if (filterTipo !== "todos") q = q.eq("tipo", filterTipo);
    if (filterUsuario !== "todos") {
      if (filterUsuario === "sem") q = q.is("criado_por", null);
      else q = q.eq("criado_por", filterUsuario);
    }
    const { data, error } = await q;
    if (error) mostrarErro(error); else setItems((data ?? []) as Lanc[]);
    setLoading(false);
  };
  const loadResumo = async () => {
    if (!clinicaAtual) { setResumo({ r: 0, d: 0, saldo: 0, totalRows: 0 }); return; }
    // Sem filtro por usuário/tipo → usa RPC agregado (rápido).
    if (filterUsuario === "todos" && filterTipo === "todos") {
      const { data, error } = await supabase.rpc("fin_resumo_periodo", {
        p_clinica: clinicaAtual.clinica_id, p_ini: fromDate, p_fim: toDate,
      });
      if (error) { mostrarErro(error); return; }
      let r = 0, d = 0, totalRows = 0;
      for (const row of (data ?? []) as Array<{ tipo: string; status: string; qtd: number; total: number }>) {
        totalRows += Number(row.qtd) || 0;
        if (row.status === "cancelado") continue;
        if (filterStatus !== "todos" && row.status !== filterStatus) continue;
        if (row.tipo === "receita") r += Number(row.total) || 0;
        else if (row.tipo === "despesa") d += Number(row.total) || 0;
      }
      setResumo({ r, d, saldo: r - d, totalRows });
      return;
    }
    // Com filtros → agrega no cliente sobre as linhas filtradas.
    let r = 0, d = 0, totalRows = 0;
    const CHUNK = 1000;
    let offset = 0;
    for (;;) {
      let q = supabase.from("fin_lancamentos")
        .select("tipo,status,valor")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .gte("data", fromDate).lte("data", toDate)
        .range(offset, offset + CHUNK - 1);
      if (filterTipo !== "todos") q = q.eq("tipo", filterTipo);
      if (filterUsuario !== "todos") {
        if (filterUsuario === "sem") q = q.is("criado_por", null);
        else q = q.eq("criado_por", filterUsuario);
      }
      const { data, error } = await q;
      if (error) { mostrarErro(error); return; }
      const rows = (data ?? []) as Array<{ tipo: string; status: string; valor: number | string | null }>;
      for (const row of rows) {
        totalRows += 1;
        if (row.status === "cancelado") continue;
        if (filterStatus !== "todos" && row.status !== filterStatus) continue;
        const v = Number(row.valor) || 0;
        if (row.tipo === "receita") r += v;
        else if (row.tipo === "despesa") d += v;
      }
      if (rows.length < CHUNK) break;
      offset += CHUNK;
      if (offset > 20000) break; // salvaguarda
    }
    setResumo({ r, d, saldo: r - d, totalRows });
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const [c, b, m] = await Promise.all([
      supabase.from("fin_categorias").select("id, nome, tipo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("fin_contas").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("clinica_memberships").select("user_id").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true),
    ]);
    setCats((c.data ?? []) as Opt[]); setContas((b.data ?? []) as Opt[]);
    const userIds = ((m.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", userIds);
      const list = ((profs ?? []) as Array<{ id: string; nome: string | null }>)
        .map((p) => ({ id: p.id, nome: p.nome || "(sem nome)" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setUsuarios(list);
    } else setUsuarios([]);
  };
  useEffect(() => { void load(); void loadResumo(); }, [clinicaAtual?.clinica_id, filterTipo, fromDate, toDate, filterStatus, filterUsuario]);
  useEffect(() => { void loadOpts(); }, [clinicaAtual?.clinica_id]);
  const totais = resumo;

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
    if (error) { mostrarErro(error); return; }
    toast.success("Salvo"); setOpen(false); await load(); await loadResumo();
  };

  const remove = async (l: Lanc) => {
    if (!confirm(`Excluir "${l.descricao}"?`)) return;
    const { error } = await supabase.from("fin_lancamentos").delete().eq("id", l.id);
    if (error) mostrarErro(error); else { toast.success("Removido"); await load(); await loadResumo(); }
  };

  const catsFiltradas = cats.filter((c) => !c.tipo || c.tipo === form.tipo);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-semibold">Movimento de Caixa</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas do período</p></div>
        <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            if (!items.length) { toast.info("Sem dados para exportar."); return; }
            const catMap = new Map(cats.map((c) => [c.id, c.nome]));
            const contaMap = new Map(contas.map((c) => [c.id, c.nome]));
            const userMap = new Map(usuarios.map((u) => [u.id, u.nome]));
            exportToExcel(
              items.map((l) => ({
                data: new Date(l.data).toLocaleDateString("pt-BR"),
                tipo: l.tipo,
                descricao: l.descricao,
                categoria: l.categoria_id ? catMap.get(l.categoria_id) ?? "" : "",
                conta: l.conta_id ? contaMap.get(l.conta_id) ?? "" : "",
                forma_pagamento: l.forma_pagamento ?? "",
                status: l.status,
                usuario: l.criado_por ? userMap.get(l.criado_por) ?? "" : "",
                valor: Number(l.valor).toFixed(2),
              })),
              `movimento-${fromDate}_a_${toDate}`,
              [
                { key: "data", label: "Data" },
                { key: "tipo", label: "Tipo" },
                { key: "descricao", label: "Descrição" },
                { key: "categoria", label: "Categoria" },
                { key: "conta", label: "Conta" },
                { key: "forma_pagamento", label: "Forma pagamento" },
                { key: "status", label: "Status" },
                { key: "usuario", label: "Usuário" },
                { key: "valor", label: "Valor (R$)" },
              ],
            );
          }}
        >
          <Download className="h-4 w-4 mr-2" />Exportar Excel
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          {podeEscrever && (
            <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Novo lançamento</Button></DialogTrigger>
          )}
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
                  <CurrencyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} /></div>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:bg-muted/40 transition" onClick={() => setDetalhe("receita")}><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Receitas</p><p className="text-2xl font-semibold text-green-600">{fmt(totais.r)}</p><p className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</p></CardContent></Card>
        <Card className="cursor-pointer hover:bg-muted/40 transition" onClick={() => setDetalhe("despesa")}><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Despesas</p><p className="text-2xl font-semibold text-red-600">{fmt(totais.d)}</p><p className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</p></CardContent></Card>
        <Card className="cursor-pointer hover:bg-muted/40 transition" onClick={() => setDetalhe("saldo")}><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Saldo</p><p className={`text-2xl font-semibold ${totais.saldo >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(totais.saldo)}</p><p className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</p></CardContent></Card>
      </div>

      <Dialog open={detalhe !== null} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detalhe === "saldo"
                ? `Saldo do período — ${fmt(totais.saldo)}`
                : `${detalhe === "receita" ? "Receitas" : "Despesas"} do período — ${fmt(detalhe === "receita" ? totais.r : totais.d)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {(() => {
              const list = detalhe === "saldo" ? items : items.filter((i) => i.tipo === detalhe);
              if (list.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">Sem lançamentos.</p>;
              const catMap = new Map(cats.map((c) => [c.id, c.nome]));
              return (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Data</TableHead>
                    {detalhe === "saldo" && <TableHead>Tipo</TableHead>}
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {list.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm whitespace-nowrap">{new Date(l.data).toLocaleDateString("pt-BR")}</TableCell>
                        {detalhe === "saldo" && <TableCell className="capitalize">{l.tipo}</TableCell>}
                        <TableCell>{l.descricao}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{l.categoria_id ? catMap.get(l.categoria_id) ?? "—" : "—"}</TableCell>
                        <TableCell className={`text-right font-medium ${l.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>{fmt(Number(l.valor))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

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
        <div className="space-y-1"><Label className="text-xs">Status (totais)</Label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="confirmado">Apenas confirmados</SelectItem>
              <SelectItem value="pendente">Apenas pendentes</SelectItem>
              <SelectItem value="todos">Confirmados + pendentes</SelectItem>
            </SelectContent>
          </Select></div>
        <div className="space-y-1"><Label className="text-xs">Usuário</Label>
          <Select value={filterUsuario} onValueChange={setFilterUsuario}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os usuários</SelectItem>
              <SelectItem value="sem">Sem usuário</SelectItem>
              {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select></div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          : items.length === 0 ? <div className="py-12 text-center text-muted-foreground">Nenhum lançamento no período.</div>
          : <>
          {resumo.totalRows > items.length ? (
            <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-b">
              Exibindo os {items.length.toLocaleString("pt-BR")} lançamentos mais recentes de {resumo.totalRows.toLocaleString("pt-BR")} no período. Os totais acima consideram todos.
            </div>
          ) : null}
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((l) => {
              const userMap = new Map(usuarios.map((u) => [u.id, u.nome]));
              return (
              <TableRow key={l.id}>
                <TableCell>{l.tipo === "receita"
                  ? <ArrowUpCircle className="h-4 w-4 text-green-600" />
                  : <ArrowDownCircle className="h-4 w-4 text-red-600" />}</TableCell>
                <TableCell className="text-sm">{new Date(l.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{l.descricao}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{l.criado_por ? userMap.get(l.criado_por) ?? "—" : "—"}</TableCell>
                <TableCell><Badge variant={l.status === "confirmado" ? "default" : "secondary"}>{l.status}</Badge></TableCell>
                <TableCell className={`text-right font-medium ${l.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                  {l.tipo === "receita" ? "+" : "-"} {fmt(Number(l.valor))}</TableCell>
                <TableCell className="text-right">
                  {podeEscrever ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(l)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>);
            })}
            </TableBody>
          </Table></>}
      </CardContent></Card>
    </div>
  );
}
