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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import {
  CalendarDays, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search, X,
  MoreHorizontal, Star, Flag, Printer, Download, Video,
} from "lucide-react";
import { printGuiaAtendimento } from "@/lib/print-gr";
import { VoiceInput } from "@/components/voice-input";
import { exportToExcel } from "@/lib/export-csv";
import { useAuth } from "@/hooks/use-auth";

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
type Especialidade = { id: string; nome: string };
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
const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const PAGE_SIZE = 15;

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
  const { user } = useAuth();
  const [dataRef, setDataRef] = useState(() => new Date().toISOString().slice(0, 10));
  const [apenasData, setApenasData] = useState(true);
  const [filtroMedico, setFiltroMedico] = useState<string>("todos");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<string>("todos");
  const [filtroDiaSemana, setFiltroDiaSemana] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroFicha, setFiltroFicha] = useState("");
  const [page, setPage] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Agendamento[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [medicoEspec, setMedicoEspec] = useState<Map<string, Set<string>>>(new Map());
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [pagamentoDesc, setPagamentoDesc] = useState("");

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    let q = supabase
      .from("agendamentos")
      .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,observacoes,token_publico")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("inicio");
    if (apenasData) {
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const fim = new Date(`${dataRef}T23:59:59`).toISOString();
      q = q.gte("inicio", inicio).lte("inicio", fim);
    } else {
      // próximos 30 dias a partir da data ref
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const f = new Date(`${dataRef}T00:00:00`); f.setDate(f.getDate() + 30);
      q = q.gte("inicio", inicio).lte("inicio", f.toISOString());
    }
    const { data, error } = await q;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Agendamento[]);
    setPage(1);
    setSelecionados(new Set());
  };

  const loadRef = async () => {
    if (!clinicaAtual) return;
    const [m, p, e, me] = await Promise.all([
      supabase.from("medicos").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
      supabase.from("especialidades").select("id,nome").order("nome"),
      supabase.from("medico_especialidades").select("medico_id,especialidade_id"),
    ]);
    setMedicos((m.data ?? []) as Medico[]);
    setPacientes((p.data ?? []) as Paciente[]);
    setEspecialidades((e.data ?? []) as Especialidade[]);
    const map = new Map<string, Set<string>>();
    for (const r of (me.data ?? []) as Array<{ medico_id: string; especialidade_id: string }>) {
      if (!map.has(r.medico_id)) map.set(r.medico_id, new Set());
      map.get(r.medico_id)!.add(r.especialidade_id);
    }
    setMedicoEspec(map);
  };

  useEffect(() => { loadRef(); }, [clinicaAtual?.clinica_id]);
  useEffect(() => { load(); }, [clinicaAtual?.clinica_id, dataRef, apenasData]);

  const fichaPorId = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((a, i) => m.set(a.id, String(i + 1).padStart(3, "0")));
    return m;
  }, [items]);

  const filtrados = useMemo(() => {
    return items.filter((a) => {
      if (filtroMedico !== "todos" && a.medico_id !== filtroMedico) return false;
      if (filtroStatus !== "todos" && a.status !== filtroStatus) return false;
      if (filtroCliente && !a.paciente_nome.toLowerCase().includes(filtroCliente.toLowerCase())) return false;
      if (filtroFicha) {
        const f = fichaPorId.get(a.id) ?? "";
        if (!f.includes(filtroFicha.padStart(Math.min(filtroFicha.length, 3), "0"))) return false;
      }
      if (filtroDiaSemana !== "todos") {
        const d = new Date(a.inicio).getDay();
        if (String(d) !== filtroDiaSemana) return false;
      }
      if (filtroEspecialidade !== "todos") {
        if (!a.medico_id) return false;
        const set = medicoEspec.get(a.medico_id);
        if (!set || !set.has(filtroEspecialidade)) return false;
      }
      return true;
    });
  }, [items, filtroMedico, filtroStatus, filtroCliente, filtroFicha, filtroDiaSemana, filtroEspecialidade, medicoEspec, fichaPorId]);

  const totais = useMemo(() => ({
    total: filtrados.length,
    confirmados: filtrados.filter(i => i.status === "confirmado").length,
    realizados: filtrados.filter(i => i.status === "realizado").length,
  }), [filtrados]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginados = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const limparFiltros = () => {
    setFiltroMedico("todos"); setFiltroEspecialidade("todos"); setFiltroDiaSemana("todos");
    setFiltroStatus("todos"); setFiltroCliente(""); setFiltroFicha("");
  };

  const toggleSel = (id: string) => {
    const s = new Set(selecionados);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelecionados(s);
  };
  const toggleAll = () => {
    if (selecionados.size === paginados.length) setSelecionados(new Set());
    else setSelecionados(new Set(paginados.map(p => p.id)));
  };

  const openNew = () => {
    setEditing(null);
    const base = new Date(`${dataRef}T09:00:00`);
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

  const submit = async (e: FormEvent, irParaPagamento = false) => {
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
    if (irParaPagamento) {
      const desc = `${payload.procedimento ?? "Atendimento"} — ${payload.paciente_nome}`;
      setPagamentoDesc(desc);
      setPagamentoOpen(true);
    }
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

  const imprimirGR = async (a: Agendamento) => {
    if (!clinicaAtual) return;
    try {
      await printGuiaAtendimento({
        agendamentoId: a.id,
        clinicaId: clinicaAtual.clinica_id,
        usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao imprimir GR");
    }
  };

  const shiftData = (delta: number) => {
    const d = new Date(`${dataRef}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDataRef(d.toISOString().slice(0, 10));
  };

  const medicoNome = (id: string | null) => medicos.find(m => m.id === id)?.nome ?? "—";
  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtData = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const fmtDiaSemana = (iso: string) => DIAS_SEMANA[new Date(iso).getDay()];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Agendas
          </h1>
          <p className="text-sm text-muted-foreground">Filtre e gerencie os agendamentos da clínica.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selecionados.size === 0}>
            Opções ({selecionados.size})
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!filtrados.length) { toast.info("Sem dados para exportar."); return; }
              exportToExcel(
                filtrados.map((a) => ({
                  data: new Date(a.inicio).toLocaleDateString("pt-BR"),
                  dia: fmtDiaSemana(a.inicio),
                  inicio: fmtHora(a.inicio),
                  fim: fmtHora(a.fim),
                  profissional: medicoNome(a.medico_id),
                  paciente: a.paciente_nome,
                  procedimento: a.procedimento ?? "CONSULTA",
                  status: a.status,
                  observacoes: a.observacoes ?? "",
                })),
                `agenda-${dataRef}`,
                [
                  { key: "data", label: "Data" },
                  { key: "dia", label: "Dia" },
                  { key: "inicio", label: "Início" },
                  { key: "fim", label: "Fim" },
                  { key: "profissional", label: "Profissional" },
                  { key: "paciente", label: "Cliente" },
                  { key: "procedimento", label: "Procedimento" },
                  { key: "status", label: "Status" },
                  { key: "observacoes", label: "Observações" },
                ],
              );
            }}
          >
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} disabled={!clinicaAtual} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Adicionar Encaixe
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
                <SearchableSelect
                  value={form.medico_id || "none"}
                  onChange={(v) => setForm(f => ({ ...f, medico_id: v === "none" ? "" : v }))}
                  placeholder="Selecione"
                  searchPlaceholder="Buscar médico..."
                  options={[
                    { value: "none", label: "— Sem médico —" },
                    ...medicos.map(m => ({ value: m.id, label: m.nome })),
                  ]}
                />
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
                <div className="flex items-center justify-between">
                  <Label>Observações</Label>
                  <VoiceInput
                    size="sm"
                    currentValue={form.observacoes}
                    onTranscript={(t) => setForm(f => ({ ...f, observacoes: t }))}
                    title="Ditar observações"
                  />
                </div>
                <Textarea value={form.observacoes} onChange={(e) => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={(e) => submit(e as unknown as FormEvent, true)}
                  className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  Salvar e Pagar
                </Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <LancamentoDialog
        open={pagamentoOpen}
        onOpenChange={setPagamentoOpen}
        tipo="receita"
        initialDescricao={pagamentoDesc}
      />

      {/* Filtros */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Profissional</Label>
            <SearchableSelect
              value={filtroMedico}
              onChange={setFiltroMedico}
              placeholder="TODOS"
              searchPlaceholder="Buscar médico..."
              options={[
                { value: "todos", label: "TODOS" },
                ...medicos.map(m => ({ value: m.id, label: m.nome })),
              ]}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data Ref.</Label>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => shiftData(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} />
              <Button variant="outline" size="icon" onClick={() => shiftData(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Dia Semana</Label>
            <Select value={filtroDiaSemana} onValueChange={setFiltroDiaSemana}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {DIAS_SEMANA.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</Label>
            <Input value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Buscar paciente…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nº Ficha</Label>
            <Input value={filtroFicha} onChange={(e) => setFiltroFicha(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 001" inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Especialidade</Label>
            <Select value={filtroEspecialidade} onValueChange={setFiltroEspecialidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {especialidades.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Situação</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={apenasData} onCheckedChange={(v) => setApenasData(!!v)} />
            Exibir apenas a data selecionada
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={limparFiltros}><X className="h-4 w-4 mr-2" /> Limpar</Button>
            <Button onClick={load}><Search className="h-4 w-4 mr-2" /> Exibir</Button>
          </div>
        </div>
      </div>

      {/* Totais + paginação topo */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex gap-4">
          <span>Total: <b className="text-foreground">{totais.total}</b></span>
          <span>Confirmados: <b className="text-foreground">{totais.confirmados}</b></span>
          <span>Realizados: <b className="text-foreground">{totais.realizados}</b></span>
        </div>
        <Paginacao page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-10">
                <Checkbox
                  checked={paginados.length > 0 && selecionados.size === paginados.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="w-16">Ficha</TableHead>
              <TableHead className="w-14">Dia</TableHead>
              <TableHead className="w-16">Data</TableHead>
              <TableHead className="w-32">Intervalo</TableHead>
              <TableHead>Profissional</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-32">Pasta</TableHead>
              <TableHead className="w-20 text-center">Alertas</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !clinicaAtual ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
            ) : paginados.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum agendamento encontrado.</TableCell></TableRow>
            ) : paginados.map((a) => {
              const fichaNum = fichaPorId.get(a.id) ?? "";
              const realizado = a.status === "realizado";
              return (
                <TableRow key={a.id} className={realizado ? "bg-emerald-50 dark:bg-emerald-950/20" : ""}>
                  <TableCell><Checkbox checked={selecionados.has(a.id)} onCheckedChange={() => toggleSel(a.id)} /></TableCell>
                  <TableCell className="font-mono text-sm">{fichaNum}</TableCell>
                  <TableCell className="text-sm">{fmtDiaSemana(a.inicio)}</TableCell>
                  <TableCell className="text-sm">{fmtData(a.inicio)}</TableCell>
                  <TableCell>
                    <span className="text-primary font-medium">{fmtHora(a.inicio)} - {fmtHora(a.fim)}</span>
                  </TableCell>
                  <TableCell className="truncate max-w-[200px]">{medicoNome(a.medico_id)}</TableCell>
                  <TableCell className="truncate max-w-[220px]">
                    <span className="inline-flex items-center gap-1">
                      {a.status === "confirmado" && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                      {a.paciente_nome}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{a.procedimento || "CONSULTA"}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={STATUS_COR[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => imprimirGR(a)}>
                          <Printer className="h-4 w-4 mr-2" /> Imprimir GR
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          const url = `${window.location.origin}/p/${(a as any).token_publico}`;
                          navigator.clipboard.writeText(url);
                          toast.success("Link do paciente copiado");
                        }}>
                          <Video className="h-4 w-4 mr-2" /> Copiar link do paciente
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
                          <DropdownMenuItem key={s} onClick={() => mudarStatus(a, s)}>
                            <Flag className="h-4 w-4 mr-2" /> {STATUS_LABEL[s]}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => remove(a)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-center">
        <Paginacao page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

function Paginacao({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const nums = useMemo(() => {
    const arr: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onChange(1)}>«</Button>
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>‹</Button>
      {nums.map(n => (
        <Button key={n} variant={n === page ? "default" : "outline"} size="sm" onClick={() => onChange(n)}>{n}</Button>
      ))}
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</Button>
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onChange(totalPages)}>»</Button>
    </div>
  );
}
