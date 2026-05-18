import { createFileRoute, Link } from "@tanstack/react-router";
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
  MoreHorizontal, Star, Flag, Printer, Download, Video, UserPlus, Clock, DollarSign,
} from "lucide-react";
import { printGuiaAtendimento } from "@/lib/print-gr";
import { VoiceInput } from "@/components/voice-input";
import { exportToExcel } from "@/lib/export-csv";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { listarEquipe } from "@/lib/equipe.functions";

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
  agendado: "bg-[#dbe7fb] text-slate-800 border border-[#b6cdf5]",
  confirmado: "bg-[#cfe3fb] text-slate-800 border border-[#9fc3f3]",
  realizado: "bg-[#d1f0d6] text-slate-800 border border-[#8fd49a]",
  cancelado: "bg-[#f8d2d6] text-slate-800 border border-[#eea1a8]",
  faltou: "bg-[#f7b6c0] text-slate-800 border border-[#e88594]",
};
const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const PAGE_SIZE = 15;

const normalizar = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
  const [apenasData, setApenasData] = useState(false);
  const [mostrarLivres, setMostrarLivres] = useState(true);
  const [filtroMedico, setFiltroMedico] = useState<string>("todos");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<string>("todos");
  const [filtroDiaSemana, setFiltroDiaSemana] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroFicha, setFiltroFicha] = useState("");
  const [page, setPage] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Agendamento[]>([]);
  const [pagosSet, setPagosSet] = useState<Set<string>>(new Set());
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [exames, setExames] = useState<{ id: string; nome: string }[]>([]);
  const [procedimentosList, setProcedimentosList] = useState<{ id: string; nome: string }[]>([]);
  const [procPorMedico, setProcPorMedico] = useState<Map<string, Set<string>>>(new Map());
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
  const [pagamentoAgId, setPagamentoAgId] = useState<string | null>(null);
  const [novoPacOpen, setNovoPacOpen] = useState(false);
  const [novoPac, setNovoPac] = useState({ nome: "", cpf: "", telefone: "", data_nascimento: "", email: "" });
  const [savingPac, setSavingPac] = useState(false);
  const [equipeList, setEquipeList] = useState<Array<{ nome: string | null; email: string | null }>>([]);
  const fnListarEquipe = useServerFn(listarEquipe);
  const carregarEquipe = async () => {
    if (!clinicaAtual || equipeList.length > 0) return;
    try {
      const data = await fnListarEquipe({ data: { clinicaId: clinicaAtual.clinica_id } });
      setEquipeList((data as any[]).map((m) => ({ nome: m.nome, email: m.email })));
    } catch (_) { /* silencioso */ }
  };

  const cadastrarPacienteRapido = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!novoPac.nome.trim()) { toast.error("Informe o nome"); return; }
    setSavingPac(true);
    const { data, error } = await supabase
      .from("pacientes")
      .insert({
        clinica_id: clinicaAtual.clinica_id,
        nome: novoPac.nome.trim(),
        cpf: novoPac.cpf.trim() || null,
        telefone: novoPac.telefone.trim() || null,
        data_nascimento: novoPac.data_nascimento || null,
        email: novoPac.email.trim() || null,
      })
      .select("id,nome")
      .single();
    setSavingPac(false);
    if (error) { toast.error(error.message); return; }
    setPacientes(prev => [...prev, { id: data.id, nome: data.nome }].sort((a, b) => a.nome.localeCompare(b.nome)));
    setForm(f => ({ ...f, paciente_nome: data.nome, paciente_id: data.id }));
    setNovoPac({ nome: "", cpf: "", telefone: "", data_nascimento: "", email: "" });
    setNovoPacOpen(false);
    toast.success("Paciente cadastrado");
  };

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
    // Marca agendamentos pagos (receita vinculada em fin_lancamentos)
    const ids = (data ?? []).map((a) => a.id);
    if (ids.length) {
      const { data: pg } = await supabase
        .from("fin_lancamentos")
        .select("agendamento_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .in("agendamento_id", ids);
      setPagosSet(new Set(((pg ?? []) as Array<{ agendamento_id: string | null }>)
        .map((r) => r.agendamento_id)
        .filter((x): x is string => !!x)));
    } else {
      setPagosSet(new Set());
    }
  };

  const loadRef = async () => {
    if (!clinicaAtual) return;
    const [m, p, e, me, pr, sr] = await Promise.all([
      supabase.from("medicos").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
      supabase.from("especialidades").select("id,nome").order("nome"),
      supabase.from("medico_especialidades").select("medico_id,especialidade_id"),
      supabase.from("procedimentos").select("id,nome,tipo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(5000),
      supabase.from("procedimento_split_regras").select("medico_id,procedimento_id").eq("clinica_id", clinicaAtual.clinica_id).not("medico_id", "is", null),
    ]);
    setMedicos((m.data ?? []) as Medico[]);
    setPacientes((p.data ?? []) as Paciente[]);
    setEspecialidades((e.data ?? []) as Especialidade[]);
    const todos = (pr.data ?? []) as { id: string; nome: string; tipo: string | null }[];
    setExames(todos.filter((x) => x.tipo === "exame").map(({ id, nome }) => ({ id, nome })));
    setProcedimentosList(todos.map(({ id, nome }) => ({ id, nome })));
    const map = new Map<string, Set<string>>();
    for (const r of (me.data ?? []) as Array<{ medico_id: string; especialidade_id: string }>) {
      if (!map.has(r.medico_id)) map.set(r.medico_id, new Set());
      map.get(r.medico_id)!.add(r.especialidade_id);
    }
    setMedicoEspec(map);
    const pm = new Map<string, Set<string>>();
    for (const r of (sr.data ?? []) as Array<{ medico_id: string | null; procedimento_id: string }>) {
      if (!r.medico_id) continue;
      if (!pm.has(r.medico_id)) pm.set(r.medico_id, new Set());
      pm.get(r.medico_id)!.add(r.procedimento_id);
    }
    setProcPorMedico(pm);
  };

  useEffect(() => { loadRef(); }, [clinicaAtual?.clinica_id]);
  useEffect(() => { load(); }, [clinicaAtual?.clinica_id, dataRef, apenasData]);

  // Duração padrão (minutos) inferida dos slots existentes por médico
  const duracaoPorMedico = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const a of items) {
      if (!a.medico_id || !a.inicio || !a.fim) continue;
      const d = Math.round((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000);
      if (d > 0 && d <= 480) {
        if (!buckets.has(a.medico_id)) buckets.set(a.medico_id, []);
        buckets.get(a.medico_id)!.push(d);
      }
    }
    const out = new Map<string, number>();
    for (const [mid, arr] of buckets) {
      arr.sort((x, y) => x - y);
      out.set(mid, arr[Math.floor(arr.length / 2)]);
    }
    return out;
  }, [items]);

  const calcFimAuto = (inicio: string, medicoId: string) => {
    if (!inicio) return "";
    const dur = (medicoId && duracaoPorMedico.get(medicoId)) || 30;
    const d = new Date(inicio);
    if (isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() + dur);
    return toLocalInput(d.toISOString());
  };

  const fichaPorId = useMemo(() => {
    const m = new Map<string, string>();
    // Numeração sequencial por dia (reinicia a cada data) na ordem do horário
    const contadores = new Map<string, number>();
    const ordenados = [...items].sort((a, b) => a.inicio.localeCompare(b.inicio));
    ordenados.forEach((a) => {
      const dia = a.inicio.slice(0, 10);
      const n = (contadores.get(dia) ?? 0) + 1;
      contadores.set(dia, n);
      m.set(a.id, String(n).padStart(3, "0"));
    });
    return m;
  }, [items]);

  const filtrados = useMemo(() => {
    return items.filter((a) => {
      if (!mostrarLivres && normalizar(a.paciente_nome) === "disponivel") return false;
      if (filtroMedico !== "todos" && a.medico_id !== filtroMedico) return false;
      const ehLivre = normalizar(a.paciente_nome) === "disponivel";
      if (filtroStatus === "livres") {
        if (!ehLivre) return false;
      } else if (filtroStatus !== "todos") {
        if (ehLivre) return false;
        if (a.status !== filtroStatus) return false;
      }
      if (filtroCliente && !normalizar(a.paciente_nome).includes(normalizar(filtroCliente))) return false;
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
  }, [items, mostrarLivres, filtroMedico, filtroStatus, filtroCliente, filtroFicha, filtroDiaSemana, filtroEspecialidade, medicoEspec, fichaPorId]);

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

  const cobrarSelecionados = async () => {
    if (!clinicaAtual) return;
    const ids = Array.from(selecionados);
    const itens = items.filter(a => ids.includes(a.id));
    if (itens.length === 0) { toast.info("Selecione ao menos um atendimento."); return; }
    const pacientes = new Set(itens.map(i => i.paciente_nome));
    if (pacientes.size > 1) {
      toast.error("Selecione atendimentos do mesmo paciente para cobrar em uma única vez.");
      return;
    }
    // busca valores dos procedimentos pelo nome (valor_dinheiro como base, fallback valor_padrao)
    const nomes = Array.from(new Set(itens.map(i => (i.procedimento ?? "CONSULTA").trim().toUpperCase())));
    const { data: procs } = await supabase
      .from("procedimentos")
      .select("nome,valor_dinheiro,valor_padrao")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .in("nome", nomes);
    const valorPorNome = new Map<string, number>();
    for (const p of (procs ?? []) as Array<{ nome: string; valor_dinheiro: number | null; valor_padrao: number | null }>) {
      valorPorNome.set(p.nome.toUpperCase(), Number(p.valor_dinheiro ?? p.valor_padrao ?? 0));
    }
    const total = itens.reduce((s, i) => s + (valorPorNome.get((i.procedimento ?? "CONSULTA").trim().toUpperCase()) ?? 0), 0);
    const paciente = itens[0].paciente_nome;
    const desc = `${paciente} — ${itens.map(i => (i.procedimento ?? "CONSULTA")).join(" + ")} (${itens.length} itens)`;
    setPagamentoDesc(desc);
    setPagamentoValor(total > 0 ? total.toFixed(2) : "");
    setPagamentoOpen(true);
  };
  const [pagamentoValor, setPagamentoValor] = useState("");

  const openNew = () => {
    setEditing(null);
    const base = new Date(`${dataRef}T09:00:00`);
    const end = new Date(base.getTime() + 30 * 60000);
    setForm({ ...EMPTY, inicio: toLocalInput(base.toISOString()), fim: toLocalInput(end.toISOString()) });
    setOpen(true);
  };
  const openSlot = (a: Agendamento) => {
    setEditing(a);
    setForm({
      paciente_nome: "",
      paciente_id: "",
      medico_id: a.medico_id ?? "",
      inicio: toLocalInput(a.inicio), fim: toLocalInput(a.fim),
      procedimento: a.procedimento ?? "CONSULTA",
      status: "agendado",
      observacoes: a.observacoes ?? "",
    });
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
    if (new Date(form.fim) <= new Date(form.inicio)) { toast.error("O horário final deve ser após o inicial"); return; }
    if (!form.procedimento.trim()) { toast.error("Selecione o procedimento"); return; }
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
      const nomeBusca = normalizar((payload.procedimento ?? "CONSULTA").trim());
      const { data: lista } = await supabase
        .from("procedimentos")
        .select("nome,valor_dinheiro,valor_padrao")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .limit(5000);
      const proc = (lista ?? []).find((p) => normalizar(p.nome ?? "") === nomeBusca)
        ?? (lista ?? []).find((p) => normalizar(p.nome ?? "").includes(nomeBusca));
      const valor = Number(proc?.valor_dinheiro ?? proc?.valor_padrao ?? 0);
      setPagamentoDesc(`${payload.paciente_nome} — ${payload.procedimento ?? "CONSULTA"}`);
      setPagamentoValor(valor > 0 ? valor.toFixed(2) : "");
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

  const cobrarAgendamento = async (a: Agendamento) => {
    if (!clinicaAtual) return;
    if (pagosSet.has(a.id)) {
      toast.info("Este agendamento já foi pago.");
      return;
    }
    const nomeBusca = normalizar((a.procedimento ?? "CONSULTA").trim());
    const { data: lista } = await supabase
      .from("procedimentos")
      .select("nome,valor_dinheiro,valor_padrao")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .limit(5000);
    const proc = (lista ?? []).find((p) => normalizar(p.nome ?? "") === nomeBusca)
      ?? (lista ?? []).find((p) => normalizar(p.nome ?? "").includes(nomeBusca));
    const valor = Number(proc?.valor_dinheiro ?? proc?.valor_padrao ?? 0);
    setPagamentoDesc(`${a.paciente_nome} — ${a.procedimento ?? "CONSULTA"}`);
    setPagamentoValor(valor > 0 ? valor.toFixed(2) : "");
    setPagamentoAgId(a.id);
    setPagamentoOpen(true);
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
          <Button asChild variant="outline" title="Cadastrar horários semanais e gerar slots da agenda">
            <Link to="/app/disponibilidades">
              <Clock className="h-4 w-4 mr-2" /> Criar/gerar horários
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={selecionados.size === 0}>
                Opções ({selecionados.size})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={cobrarSelecionados}>
                💳 Cobrar selecionados (1 pagamento)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                <div className="flex gap-2">
                  <Input list="lista-pacientes" value={form.paciente_nome}
                    onChange={(e) => {
                      const nome = e.target.value;
                      const match = pacientes.find(p => p.nome === nome);
                      setForm(f => ({ ...f, paciente_nome: nome, paciente_id: match?.id ?? "" }));
                    }}
                    placeholder="Nome do paciente" required />
                  <Button type="button" variant="outline" size="icon" title="Cadastrar novo paciente"
                    onClick={() => { setNovoPac(p => ({ ...p, nome: form.paciente_nome })); setNovoPacOpen(true); }}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
                <datalist id="lista-pacientes">
                  {pacientes.map(p => <option key={p.id} value={p.nome} />)}
                </datalist>
                {form.paciente_nome && !form.paciente_id && (
                  <p className="text-xs text-muted-foreground">
                    Paciente não cadastrado.{" "}
                    <button type="button" className="underline text-primary"
                      onClick={() => { setNovoPac(p => ({ ...p, nome: form.paciente_nome })); setNovoPacOpen(true); }}>
                      Cadastrar agora
                    </button>
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Médico ou Exame</Label>
                <SearchableSelect
                  value={form.medico_id || "none"}
                  onChange={(v) => {
                    if (v.startsWith("exame:")) {
                      const nome = v.slice(6);
                      setForm(f => ({ ...f, medico_id: "", procedimento: nome }));
                    } else {
                       setForm(f => {
                         const medico_id = v === "none" ? "" : v;
                         const fim = f.inicio ? calcFimAuto(f.inicio, medico_id) : f.fim;
                         return { ...f, medico_id, fim };
                       });
                    }
                  }}
                  placeholder="Selecione médico ou exame"
                  searchPlaceholder="Buscar médico ou exame..."
                  options={[
                    { value: "none", label: "— Sem médico —" },
                    ...medicos.map(m => ({ value: m.id, label: `👨‍⚕️ ${m.nome}` })),
                    ...exames.map(e => ({ value: `exame:${e.nome}`, label: `🧪 ${e.nome}` })),
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Início</Label>
                  <Input type="datetime-local" value={form.inicio} onChange={(e) => setForm(f => ({ ...f, inicio: e.target.value, fim: calcFimAuto(e.target.value, f.medico_id) }))} required />
                </div>
                <div className="space-y-1">
                  <Label>Fim</Label>
                  <Input type="datetime-local" value={form.fim} onChange={(e) => setForm(f => ({ ...f, fim: e.target.value }))} required />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Procedimento</Label>
                {form.medico_id && procPorMedico.get(form.medico_id)?.size ? (
                  <p className="text-xs text-muted-foreground">Mostrando apenas procedimentos configurados para este médico.</p>
                ) : null}
                <SearchableSelect
                  value={form.procedimento || "none"}
                  onChange={(v) => setForm(f => ({ ...f, procedimento: v === "none" ? "" : v }))}
                  placeholder="Selecione o procedimento"
                  searchPlaceholder="Buscar procedimento..."
                  options={[
                    { value: "none", label: "— Selecione —" },
                    ...(() => {
                      const idsDoMedico = form.medico_id ? procPorMedico.get(form.medico_id) : undefined;
                      const filtrados = (idsDoMedico && idsDoMedico.size > 0)
                        ? procedimentosList.filter((p) => idsDoMedico.has(p.id))
                        : procedimentosList;
                      return filtrados.map((p) => ({ value: p.nome, label: p.nome }));
                    })(),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                {editing && normalizar(editing.paciente_nome) !== "disponivel" ? (
                  <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as Status }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={STATUS_LABEL[form.status]} disabled readOnly />
                )}
                {(!editing || normalizar(editing.paciente_nome) === "disponivel") && (
                  <p className="text-xs text-muted-foreground">Status definido automaticamente. Pode ser alterado depois pelo menu de ações.</p>
                )}
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
        onOpenChange={(v) => { setPagamentoOpen(v); if (!v) setPagamentoAgId(null); }}
        tipo="receita"
        initialDescricao={pagamentoDesc}
        initialValor={pagamentoValor}
        agendamentoId={pagamentoAgId}
        onSavedWithData={async (dados) => {
          if (!pagamentoAgId || !clinicaAtual) return;
          const agId = pagamentoAgId;
          setPagosSet((prev) => {
            const next = new Set(prev);
            next.add(agId);
            return next;
          });
          if (confirm("Pagamento registrado. Imprimir Guia de Atendimento (GR) agora?")) {
            try {
              await printGuiaAtendimento({
                agendamentoId: pagamentoAgId,
                clinicaId: clinicaAtual.clinica_id,
                usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
                pagamento: {
                  valor: dados.valor,
                  forma_pagamento: dados.forma_pagamento,
                  parcelas: dados.parcelas,
                  bandeira_cartao: dados.bandeira_cartao,
                  detalhe: dados.pagamentos_detalhe,
                },
              });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao imprimir GR");
            }
          }
          setPagamentoAgId(null);
        }}
      />

      <Dialog open={novoPacOpen} onOpenChange={setNovoPacOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastro rápido de paciente</DialogTitle>
          </DialogHeader>
          <form onSubmit={cadastrarPacienteRapido} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Importar de usuário do sistema</Label>
              <Select
                onOpenChange={(o) => o && carregarEquipe()}
                onValueChange={(v) => {
                  const m = equipeList.find((e) => `${e.nome}|${e.email}` === v);
                  if (m) setNovoPac((p) => ({ ...p, nome: m.nome ?? p.nome, email: m.email ?? p.email }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um membro da equipe (opcional)" /></SelectTrigger>
                <SelectContent>
                  {equipeList.length === 0
                    ? <div className="px-2 py-1.5 text-sm text-muted-foreground">Carregando…</div>
                    : equipeList.map((m, i) => (
                        <SelectItem key={i} value={`${m.nome}|${m.email}`}>
                          {m.nome ?? "—"} {m.email ? `(${m.email})` : ""}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Preenche nome e e-mail. Complete CPF, telefone e nascimento abaixo.</p>
            </div>
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={novoPac.nome} onChange={(e) => setNovoPac(p => ({ ...p, nome: e.target.value }))} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input value={novoPac.cpf} onChange={(e) => setNovoPac(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1">
                <Label>Nascimento</Label>
                <Input type="date" value={novoPac.data_nascimento} onChange={(e) => setNovoPac(p => ({ ...p, data_nascimento: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={novoPac.telefone} onChange={(e) => setNovoPac(p => ({ ...p, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={novoPac.email} onChange={(e) => setNovoPac(p => ({ ...p, email: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovoPacOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingPac} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingPac ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
            <div className="flex gap-1">
              <Input value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Buscar paciente…" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Cadastrar paciente rápido"
                onClick={() => {
                  setNovoPac({ nome: filtroCliente.trim(), cpf: "", telefone: "", data_nascimento: "", email: "" });
                  setNovoPacOpen(true);
                }}
              >
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
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
                <SelectItem value="livres">Livres</SelectItem>
                {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={apenasData} onCheckedChange={(v) => setApenasData(!!v)} />
              Exibir apenas a data selecionada
            </label>
          </div>
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
                   <TableCell className="truncate max-w-[220px] uppercase">
                     {normalizar(a.paciente_nome) === "disponivel" ? (
                       <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => openSlot(a)}
                         title="Agendar paciente neste horário"
                         className="h-7 px-2 text-muted-foreground hover:text-primary"
                       >
                         <UserPlus className="h-4 w-4 mr-1" />
                         Agendar
                       </Button>
                     ) : (
                       <span className="inline-flex items-center gap-1">
                         {a.status === "confirmado" && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                         {a.paciente_nome}
                       </span>
                     )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{a.procedimento || "CONSULTA"}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                      <Badge className={STATUS_COR[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                      {pagosSet.has(a.id) && (
                        <Badge className="bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-600">
                          Pago
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Pagamento"
                      onClick={() => cobrarAgendamento(a)}
                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    >
                      <DollarSign className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => cobrarAgendamento(a)}>
                          <DollarSign className="h-4 w-4 mr-2" /> Pagamento
                        </DropdownMenuItem>
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

      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="text-center font-semibold mb-3">Legenda</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { cor: "#cfe3fb", borda: "#9fc3f3", label: "Confirmado pelo cliente" },
            { cor: "#a8c8ed", borda: "#7aa9d8", label: "Presente na clínica" },
            { cor: "#7fbfc2", borda: "#5a9ea1", label: "Em atendimento" },
            { cor: "#d1f0d6", borda: "#8fd49a", label: "Atendido com sucesso" },
            { cor: "#fde2c4", borda: "#f5c890", label: "Agenda de telemedicina" },
            { cor: "#f8d2d6", borda: "#eea1a8", label: "Cancelado pelo cliente" },
            { cor: "#fef3b6", borda: "#f0dc7a", label: "Atrasado para consulta" },
            { cor: "#e0cdf0", borda: "#bea4d8", label: "Agendamento on-line" },
            { cor: "#f7b6c0", borda: "#e88594", label: "Não comparecimento" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block h-6 w-10 rounded border"
                style={{ background: s.cor, borderColor: s.borda }}
              />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
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
