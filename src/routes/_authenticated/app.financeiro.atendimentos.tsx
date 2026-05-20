import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Stethoscope, Download, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
  origem?: "manual" | "agenda";
}
interface Medico { id: string; nome: string; tipo_repasse: string; percentual_repasse_padrao: number; valor_repasse_padrao: number | null }
interface Pac { id: string; nome: string }
interface Convenio { medico_id: string; nome: string; tipo_repasse: string; percentual: number | null; valor: number | null }

const EMPTY = {
  data: new Date().toISOString().slice(0, 10), medico_id: "", paciente_id: "",
  procedimento: "", valor_total: "", forma_pagamento: "", status: "realizado",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Page() {
  const { clinicaAtual } = useClinica();
  const { medicoId: medicoLogadoId, isMedicoOnly } = useMedicoContext();
  const [items, setItems] = useState<Atend[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pacientes, setPacientes] = useState<Pac[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Atend | null>(null);
  const [form, setForm] = useState(EMPTY);
  // Filtros do relatório
  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDia = new Date();
  primeiroDia.setDate(1);
  const [fMedico, setFMedico] = useState<string>("todos");
  const [fIni, setFIni] = useState<string>(primeiroDia.toISOString().slice(0, 10));
  const [fFim, setFFim] = useState<string>(hoje);

  // Perfil médico: trava o filtro no próprio profissional
  useEffect(() => {
    if (isMedicoOnly && medicoLogadoId) setFMedico(medicoLogadoId);
  }, [isMedicoOnly, medicoLogadoId]);

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const calcRepasse = (medicoId: string | null, total: number, procNome: string | null): number => {
    if (!medicoId || !total) return 0;
    const med = medicos.find((m) => m.id === medicoId);
    // 1) tenta convenio por nome do procedimento
    if (procNome) {
      const alvo = norm(procNome);
      const c = convenios.find((cv) => cv.medico_id === medicoId && norm(cv.nome) === alvo);
      if (c) {
        if (c.tipo_repasse === "valor" && c.valor != null) return Math.min(Number(c.valor), total);
        return +(total * Number(c.percentual ?? 0) / 100).toFixed(2);
      }
    }
    // 2) fallback repasse padrão do médico
    if (med) {
      if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
        return Math.min(Number(med.valor_repasse_padrao), total);
      }
      return +(total * Number(med.percentual_repasse_padrao ?? 0) / 100).toFixed(2);
    }
    return 0;
  };

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    // Une atendimentos manuais (fin_atendimentos) com pagamentos da agenda (fin_lancamentos receita).
    let qManual = supabase
      .from("fin_atendimentos")
      .select("id, data, procedimento, valor_total, valor_medico, valor_clinica, status, forma_pagamento, medico_id, paciente_id")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("data", fIni)
      .lte("data", fFim);
    let qAgenda = supabase
      .from("fin_lancamentos")
      .select("id, data, descricao, valor, forma_pagamento, medico_id, paciente_id, agendamento_id")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("tipo", "receita")
      .eq("status", "confirmado")
      .gt("valor", 0)
      .not("medico_id", "is", null)
      .gte("data", fIni)
      .lte("data", fFim);
    if (fMedico !== "todos") {
      qManual = qManual.eq("medico_id", fMedico);
      qAgenda = qAgenda.eq("medico_id", fMedico);
    }
    const [mr, ar] = await Promise.all([qManual.order("data", { ascending: false }), qAgenda.order("data", { ascending: false })]);
    if (mr.error) { toast.error(mr.error.message); setLoading(false); return; }
    if (ar.error) { toast.error(ar.error.message); setLoading(false); return; }
    const manuais: Atend[] = (mr.data ?? []).map((r) => ({
      id: r.id, data: r.data, procedimento: r.procedimento,
      valor_total: Number(r.valor_total), valor_medico: Number(r.valor_medico), valor_clinica: Number(r.valor_clinica),
      status: r.status, forma_pagamento: r.forma_pagamento, medico_id: r.medico_id, paciente_id: r.paciente_id,
      origem: "manual",
    }));
    const agend: Atend[] = (ar.data ?? []).map((r) => {
      const proc = (r.descricao ?? "").split("—").slice(1).join("—").trim() || r.descricao;
      const total = Number(r.valor);
      const repasse = calcRepasse(r.medico_id, total, proc);
      return {
        id: r.id, data: r.data, procedimento: proc,
        valor_total: total, valor_medico: repasse, valor_clinica: +(total - repasse).toFixed(2),
        status: "realizado", forma_pagamento: r.forma_pagamento,
        medico_id: r.medico_id, paciente_id: r.paciente_id,
        origem: "agenda",
      };
    });
    const unif = [...manuais, ...agend].sort((a, b) => (a.data < b.data ? 1 : -1));
    setItems(unif);
    setLoading(false);
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const [m, p] = await Promise.all([
      supabase.from("medicos").select("id, nome, tipo_repasse, percentual_repasse_padrao, valor_repasse_padrao").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id, nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
    ]);
    setMedicos((m.data ?? []) as Medico[]); setPacientes((p.data ?? []) as Pac[]);
    const ids = ((m.data ?? []) as Medico[]).map((x) => x.id);
    if (ids.length) {
      const { data: cv } = await supabase
        .from("medico_convenios")
        .select("medico_id, nome, tipo_repasse, percentual, valor, ativo")
        .in("medico_id", ids)
        .eq("ativo", true);
      setConvenios((cv ?? []) as Convenio[]);
    }
  };
  useEffect(() => { void loadOpts(); }, [clinicaAtual?.clinica_id]);
  useEffect(() => { void load(); /* refaz ao mudar filtros ou opções de repasse */ },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clinicaAtual?.clinica_id, fMedico, fIni, fFim, medicos.length, convenios.length]);

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
  const totais = useMemo(() => items.reduce(
    (acc, a) => {
      acc.total += Number(a.valor_total) || 0;
      acc.medico += Number(a.valor_medico) || 0;
      acc.clinica += Number(a.valor_clinica) || 0;
      return acc;
    },
    { total: 0, medico: 0, clinica: 0 },
  ), [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Procedimentos realizados com repasse automático (inclui pagamentos da agenda)</p></div>
        <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            if (!items.length) { toast.info("Sem dados para exportar."); return; }
            exportToExcel(
              items.map((a) => ({
                data: new Date(a.data).toLocaleDateString("pt-BR"),
                medico: a.medico_id ? medMap.get(a.medico_id) ?? "" : "",
                paciente: a.paciente_id ? pacMap.get(a.paciente_id) ?? "" : "",
                procedimento: a.procedimento ?? "",
                valor_total: Number(a.valor_total).toFixed(2),
                valor_medico: Number(a.valor_medico).toFixed(2),
                valor_clinica: Number(a.valor_clinica).toFixed(2),
                forma_pagamento: a.forma_pagamento ?? "",
                status: a.status,
              })),
              `atendimentos-${new Date().toISOString().slice(0, 10)}`,
              [
                { key: "data", label: "Data" },
                { key: "medico", label: "Médico" },
                { key: "paciente", label: "Paciente" },
                { key: "procedimento", label: "Procedimento" },
                { key: "valor_total", label: "Valor total (R$)" },
                { key: "valor_medico", label: "Repasse médico (R$)" },
                { key: "valor_clinica", label: "Clínica (R$)" },
                { key: "forma_pagamento", label: "Forma pagamento" },
                { key: "status", label: "Status" },
              ],
            );
          }}
        >
          <Download className="h-4 w-4 mr-2" />Exportar Excel
        </Button>
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
                    {medicos.map((m) => <SelectItem key={m.id} value={m.id} className="uppercase">{m.nome}</SelectItem>)}
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
                  <CurrencyInput value={form.valor_total} onChange={(v) => setForm({ ...form, valor_total: v })} /></div>
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
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Médico</Label>
              <MedicoCombobox value={fMedico} onChange={setFMedico} medicos={medicos} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={fIni} onChange={(e) => setFIni(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Total</div>
                <div className="text-sm font-semibold">{fmt(totais.total)}</div>
              </div>
              <div className="rounded-md border p-2 bg-primary/5">
                <div className="text-[10px] text-muted-foreground uppercase">Repasse médico</div>
                <div className="text-sm font-semibold text-primary">{fmt(totais.medico)}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Clínica</div>
                <div className="text-sm font-semibold">{fmt(totais.clinica)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          : items.length === 0 ? <div className="py-12 text-center text-muted-foreground"><Stethoscope className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />Nenhum atendimento no período/filtro selecionado.</div>
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
                <TableCell className="text-right font-semibold text-primary">{fmt(Number(a.valor_medico))}</TableCell>
                <TableCell className="text-right text-muted-foreground">{fmt(Number(a.valor_clinica))}</TableCell>
                <TableCell className="text-right">
                  {a.origem === "agenda" ? (
                    <span className="text-[10px] text-muted-foreground uppercase">Agenda</span>
                  ) : (<>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>)}
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}

function MedicoCombobox({ value, onChange, medicos }: { value: string; onChange: (v: string) => void; medicos: Array<{ id: string; nome: string }> }) {
  const [open, setOpen] = useState(false);
  const selected = medicos.find((m) => m.id === value);
  const label = value === "todos" || !selected ? "Todos os médicos" : selected.nome;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
          "uppercase text-left"
        )}>
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar médico..." />
          <CommandList>
            <CommandEmpty>Nenhum médico encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="todos os médicos" onSelect={() => { onChange("todos"); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4", value === "todos" ? "opacity-100" : "opacity-0")} />
                Todos os médicos
              </CommandItem>
              {medicos.map((m) => (
                <CommandItem key={m.id} value={m.nome} onSelect={() => { onChange(m.id); setOpen(false); }} className="uppercase">
                  <Check className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")} />
                  {m.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
