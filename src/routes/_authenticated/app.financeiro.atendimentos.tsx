import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/financeiro/atendimentos")({
  component: Page,
  head: () => ({ meta: [{ title: "Atendimentos — Financeiro" }] }),
});

interface Atend {
  id: string; data: string; procedimento: string | null;
  valor_total: number; valor_medico: number; valor_clinica: number;
  status: string; forma_pagamento: string | null;
  medico_id: string | null; paciente_id: string | null;
}
interface Medico { id: string; nome: string; tipo_repasse: string; percentual_repasse_padrao: number; valor_repasse_padrao: number | null }
interface Pac { id: string; nome: string }

const EMPTY = {
  data: new Date().toISOString().slice(0, 10), medico_id: "", paciente_id: "",
  procedimento: "", valor_total: "", forma_pagamento: "", status: "realizado",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const [items, setItems] = useState<Atend[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pacientes, setPacientes] = useState<Pac[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Atend | null>(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("fin_atendimentos")
      .select("id, data, procedimento, valor_total, valor_medico, valor_clinica, status, forma_pagamento, medico_id, paciente_id")
      .eq("clinica_id", clinicaAtual.clinica_id).order("data", { ascending: false }).limit(200);
    if (error) toast.error(error.message); else setItems((data ?? []) as Atend[]);
    setLoading(false);
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const [m, p] = await Promise.all([
      supabase.from("medicos").select("id, nome, tipo_repasse, percentual_repasse_padrao, valor_repasse_padrao").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
    ]);
    setMedicos((m.data ?? []) as Medico[]); setPacientes((p.data ?? []) as Pac[]);
  };
  useEffect(() => { void load(); void loadOpts(); }, [clinicaAtual?.clinica_id]);

  const calc = useMemo(() => {
    const total = Number(form.valor_total || 0);
    const med = medicos.find((m) => m.id === form.medico_id);
    if (!med || !total) return { medico: 0, clinica: total };
    if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
      const v = Number(med.valor_repasse_padrao);
      return { medico: v, clinica: Math.max(0, total - v) };
    }
    const pct = Number(med.percentual_repasse_padrao || 0);
    const medico = +(total * pct / 100).toFixed(2);
    return { medico, clinica: +(total - medico).toFixed(2) };
  }, [form.valor_total, form.medico_id, medicos]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (a: Atend) => { setEditing(a); setForm({
    data: a.data, medico_id: a.medico_id ?? "", paciente_id: a.paciente_id ?? "",
    procedimento: a.procedimento ?? "", valor_total: String(a.valor_total),
    forma_pagamento: a.forma_pagamento ?? "", status: a.status,
  }); setOpen(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id, data: form.data,
      medico_id: form.medico_id || null, paciente_id: form.paciente_id || null,
      procedimento: form.procedimento || null, valor_total: Number(form.valor_total),
      valor_medico: calc.medico, valor_clinica: calc.clinica,
      forma_pagamento: form.forma_pagamento || null, status: form.status,
    };
    const { error } = editing
      ? await supabase.from("fin_atendimentos").update(payload).eq("id", editing.id)
      : await supabase.from("fin_atendimentos").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const remove = async (a: Atend) => {
    if (!confirm("Excluir atendimento?")) return;
    const { error } = await supabase.from("fin_atendimentos").delete().eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success("Removido"); await load(); }
  };

  const medMap = new Map(medicos.map((m) => [m.id, m.nome]));
  const pacMap = new Map(pacientes.map((p) => [p.id, p.nome]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Procedimentos realizados com repasse automático</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} disabled={!clinicaAtual}><Plus className="h-4 w-4 mr-2" />Novo atendimento</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} atendimento</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Data</Label>
                  <Input type="date" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="realizado">Realizado</SelectItem>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
              <div className="space-y-2"><Label>Médico</Label>
                <Select value={form.medico_id || "none"} onValueChange={(v) => setForm({ ...form, medico_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {medicos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>Paciente</Label>
                <Select value={form.paciente_id || "none"} onValueChange={(v) => setForm({ ...form, paciente_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>Procedimento</Label>
                <Input value={form.procedimento} onChange={(e) => setForm({ ...form, procedimento: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Valor total *</Label>
                  <Input type="number" step="0.01" required value={form.valor_total} onChange={(e) => setForm({ ...form, valor_total: e.target.value })} /></div>
                <div className="space-y-2"><Label>Forma de pagamento</Label>
                  <Input value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} /></div>
              </div>
              <div className="bg-muted rounded-md p-3 text-sm flex justify-between">
                <span>Repasse médico: <strong>{fmt(calc.medico)}</strong></span>
                <span>Clínica: <strong>{fmt(calc.clinica)}</strong></span>
              </div>
              <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          : items.length === 0 ? <div className="py-12 text-center text-muted-foreground"><Stethoscope className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />Nenhum atendimento registrado.</div>
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Médico</TableHead><TableHead>Paciente</TableHead>
              <TableHead>Procedimento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Médico</TableHead>
              <TableHead className="text-right">Clínica</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-sm">{new Date(a.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="text-sm">{a.medico_id ? medMap.get(a.medico_id) ?? "—" : "—"}</TableCell>
                <TableCell className="text-sm">{a.paciente_id ? pacMap.get(a.paciente_id) ?? "—" : "—"}</TableCell>
                <TableCell className="text-sm">{a.procedimento ?? "—"}</TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(a.valor_total))}</TableCell>
                <TableCell className="text-right text-muted-foreground">{fmt(Number(a.valor_medico))}</TableCell>
                <TableCell className="text-right text-muted-foreground">{fmt(Number(a.valor_clinica))}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}
