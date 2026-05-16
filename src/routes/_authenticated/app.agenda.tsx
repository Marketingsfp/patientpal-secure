import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/agenda")({
  component: AgendaPage,
});

type Status = "agendado" | "confirmado" | "realizado" | "cancelado" | "faltou";
type Agendamento = {
  id: string;
  paciente_nome: string;
  paciente_id: string | null;
  medico_id: string | null;
  inicio: string;
  fim: string;
  procedimento: string | null;
  status: Status;
  observacoes: string | null;
};
type Medico = { id: string; nome: string };
type Paciente = { id: string; nome: string };

const STATUS_LABEL: Record<Status, string> = {
  agendado: "Agendado", confirmado: "Confirmado", realizado: "Realizado",
  cancelado: "Cancelado", faltou: "Faltou",
};
const STATUS_COR: Record<Status, string> = {
  agendado: "bg-primary/10 text-primary",
  confirmado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  realizado: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  cancelado: "bg-muted text-muted-foreground",
  faltou: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EMPTY = {
  paciente_nome: "", paciente_id: "", medico_id: "",
  inicio: "", fim: "", procedimento: "",
  status: "agendado" as Status, observacoes: "",
};

function AgendaPage() {
  const { clinicaAtual } = useClinica();
  const [dia, setDia] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Agendamento[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const inicio = new Date(`${dia}T00:00:00`).toISOString();
    const fim = new Date(`${dia}T23:59:59`).toISOString();
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,observacoes")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("inicio", inicio).lte("inicio", fim)
      .order("inicio");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Agendamento[]);
  };

  const loadRef = async () => {
    if (!clinicaAtual) return;
    const [m, p] = await Promise.all([
      supabase.from("medicos").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
    ]);
    setMedicos((m.data ?? []) as Medico[]);
    setPacientes((p.data ?? []) as Paciente[]);
  };

  useEffect(() => { loadRef(); }, [clinicaAtual?.clinica_id]);
  useEffect(() => { load(); }, [clinicaAtual?.clinica_id, dia]);

  const totais = useMemo(() => ({
    total: items.length,
    confirmados: items.filter(i => i.status === "confirmado").length,
    realizados: items.filter(i => i.status === "realizado").length,
  }), [items]);

  const openNew = () => {
    setEditing(null);
    const base = new Date(`${dia}T09:00:00`);
    const end = new Date(base.getTime() + 30 * 60000);
    setForm({ ...EMPTY, inicio: toLocalInput(base.toISOString()), fim: toLocalInput(end.toISOString()) });
    setOpen(true);
  };
  const openEdit = (a: Agendamento) => {
    setEditing(a);
    setForm({
      paciente_nome: a.paciente_nome,
      paciente_id: a.paciente_id ?? "",
      medico_id: a.medico_id ?? "",
      inicio: toLocalInput(a.inicio), fim: toLocalInput(a.fim),
      procedimento: a.procedimento ?? "",
      status: a.status,
      observacoes: a.observacoes ?? "",
    });
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!form.paciente_nome.trim()) { toast.error("Informe o paciente"); return; }
    if (!form.inicio || !form.fim) { toast.error("Defina início e fim"); return; }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      paciente_nome: form.paciente_nome.trim(),
      paciente_id: form.paciente_id || null,
      medico_id: form.medico_id || null,
      inicio: new Date(form.inicio).toISOString(),
      fim: new Date(form.fim).toISOString(),
      procedimento: form.procedimento.trim() || null,
      status: form.status,
      observacoes: form.observacoes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("agendamentos").update(payload).eq("id", editing.id)
      : await supabase.from("agendamentos").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Salvo"); setOpen(false); await load();
  };

  const remove = async (a: Agendamento) => {
    if (!confirm(`Excluir agendamento de ${a.paciente_nome}?`)) return;
    const { error } = await supabase.from("agendamentos").delete().eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); await load(); }
  };

  const mudarStatus = async (a: Agendamento, status: Status) => {
    const { error } = await supabase.from("agendamentos").update({ status }).eq("id", a.id);
    if (error) toast.error(error.message); else await load();
  };

  const shiftDia = (delta: number) => {
    const d = new Date(`${dia}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDia(d.toISOString().slice(0, 10));
  };

  const medicoNome = (id: string | null) => medicos.find(m => m.id === id)?.nome ?? "—";
  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Agenda de pacientes
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie os agendamentos da clínica por dia.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} disabled={!clinicaAtual}>
              <Plus className="h-4 w-4 mr-2" /> Novo agendamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label>Paciente</Label>
                <Input list="lista-pacientes" value={form.paciente_nome}
                  onChange={(e) => {
                    const nome = e.target.value;
                    const match = pacientes.find(p => p.nome === nome);
                    setForm(f => ({ ...f, paciente_nome: nome, paciente_id: match?.id ?? "" }));
                  }}
                  placeholder="Nome do paciente" required />
                <datalist id="lista-pacientes">
                  {pacientes.map(p => <option key={p.id} value={p.nome} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label>Médico</Label>
                <Select value={form.medico_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, medico_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem médico —</SelectItem>
                    {medicos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Início</Label>
                  <Input type="datetime-local" value={form.inicio} onChange={(e) => setForm(f => ({ ...f, inicio: e.target.value }))} required />
                </div>
                <div className="space-y-1">
                  <Label>Fim</Label>
                  <Input type="datetime-local" value={form.fim} onChange={(e) => setForm(f => ({ ...f, fim: e.target.value }))} required />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Procedimento</Label>
                <Input value={form.procedimento} onChange={(e) => setForm(f => ({ ...f, procedimento: e.target.value }))} placeholder="Consulta, retorno…" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as Status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => shiftDia(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="w-44" />
        <Button variant="outline" size="icon" onClick={() => shiftDia(1)}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setDia(new Date().toISOString().slice(0, 10))}>Hoje</Button>
        <div className="ml-auto flex gap-4 text-sm text-muted-foreground">
          <span>Total: <b className="text-foreground">{totais.total}</b></span>
          <span>Confirmados: <b className="text-foreground">{totais.confirmados}</b></span>
          <span>Realizados: <b className="text-foreground">{totais.realizados}</b></span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : !clinicaAtual ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Selecione uma clínica.</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum agendamento neste dia.</div>
        ) : items.map((a) => (
          <div key={a.id} className="p-4 flex flex-wrap items-center gap-4">
            <div className="w-24 font-mono text-sm">
              {fmtHora(a.inicio)}<span className="text-muted-foreground"> – {fmtHora(a.fim)}</span>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="font-medium">{a.paciente_nome}</div>
              <div className="text-xs text-muted-foreground">
                {medicoNome(a.medico_id)}{a.procedimento ? ` • ${a.procedimento}` : ""}
              </div>
            </div>
            <Badge className={STATUS_COR[a.status]}>{STATUS_LABEL[a.status]}</Badge>
            <Select value={a.status} onValueChange={(v) => mudarStatus(a, v as Status)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}