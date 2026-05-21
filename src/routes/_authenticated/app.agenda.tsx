import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { isCPFValido, somenteDigitos } from "@/lib/cpf";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import {
  CalendarDays, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search, X,
  MoreHorizontal, Star, Flag, Printer, Download, Video, UserPlus, Clock, DollarSign, ShieldCheck,
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
  data_pagamento?: string | null;
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

const primeiroValorValido = (...valores: unknown[]) => {
  const numeros = valores.map((valor) => Number(valor)).filter((valor) => Number.isFinite(valor));
  return numeros.find((valor) => valor > 0) ?? numeros[0] ?? 0;
};

const valorCartaoProcedimento = (proc: any) =>
  primeiroValorValido(proc?.valor_cartao_credito, proc?.valor_cartao_debito, proc?.valor_cartao, proc?.valor_padrao);

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EMPTY = {
  paciente_nome: "", paciente_id: "", medico_id: "",
  inicio: "", fim: "", procedimento: "",
  status: "agendado" as Status, observacoes: "",
  data_pagamento: "",
};

function AgendaPage() {
  const { clinicaAtual } = useClinica();
  const { medicoId: medicoLogadoId, isMedicoOnly } = useMedicoContext();
  const [usuarioEhMedico, setUsuarioEhMedico] = useState(false);
  const corClinica = (() => {
    const n = (clinicaAtual?.clinica.nome ?? "").toLowerCase();
    if (n.includes("são francisco") || n.includes("sao francisco")) return "#14532d";
    if (n.includes("menino jesus")) return "#172554";
    if (n.includes("consulta hoje")) return "#5b21b6";
    return "hsl(var(--border))";
  })();
  const bordaClinica = { borderColor: corClinica, borderWidth: 2 } as const;
  const { user } = useAuth();
  const [dataRef, setDataRef] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState<string | null>(null);
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
  const [procNomesPorMedico, setProcNomesPorMedico] = useState<Map<string, Set<string>>>(new Map());
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
  const [pagamentoExtraIds, setPagamentoExtraIds] = useState<string[]>([]);
  const [pagamentoForma, setPagamentoForma] = useState<string>("");
  const [pacInfoOpen, setPacInfoOpen] = useState(false);
  const [pacInfoLoading, setPacInfoLoading] = useState(false);
  const [pacInfo, setPacInfo] = useState<Record<string, any> | null>(null);

  const abrirInfoPaciente = async (pacienteId: string | null | undefined, nomeFallback: string) => {
    setPacInfoOpen(true);
    setPacInfo({ nome: nomeFallback });
    if (!pacienteId) return;
    setPacInfoLoading(true);
    const { data } = await supabase
      .from("pacientes")
      .select("id,nome,cpf,telefone,email,data_nascimento,numero_pasta,cidade,estado,bairro,logradouro,numero,foto_url")
      .eq("id", pacienteId)
      .maybeSingle();
    if (data) setPacInfo(data as any);
    setPacInfoLoading(false);
  };
  type FormaOpcao = { forma: string; label: string; valor: number };
  const [formaPagOpen, setFormaPagOpen] = useState(false);
  const [formaPagOpcoes, setFormaPagOpcoes] = useState<FormaOpcao[]>([]);
  const [formaPagCtx, setFormaPagCtx] = useState<{ agId: string; desc: string } | null>(null);
  const [novoPacOpen, setNovoPacOpen] = useState(false);
  const [novoPac, setNovoPac] = useState({ nome: "", cpf: "", telefone: "", data_nascimento: "", email: "" });
  const [savingPac, setSavingPac] = useState(false);
  const [equipeList, setEquipeList] = useState<Array<{ nome: string | null; email: string | null }>>([]);
  type AuditRow = { id: string; action: string; table_name: string; user_email: string | null; created_at: string; dados_antes: Record<string, unknown> | null; dados_depois: Record<string, unknown> | null };
  const [auditAg, setAuditAg] = useState<Agendamento | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Visão "Por médico — vários dias" (estilo planilha)
  const [viewMode, setViewMode] = useState<"dia" | "medico">("dia");

  const fnListarEquipe = useServerFn(listarEquipe);
  const carregarEquipe = async () => {
    if (!clinicaAtual || equipeList.length > 0) return;
    try {
      const data = await fnListarEquipe({ data: { clinicaId: clinicaAtual.clinica_id } });
      setEquipeList((data as any[]).map((m) => ({ nome: m.nome, email: m.email })));
    } catch (_) { /* silencioso */ }
  };

  const abrirAuditoria = async (a: Agendamento) => {
    setAuditAg(a);
    setAuditLoading(true);
    setAuditRows([]);
    void carregarEquipe();
    const { data, error } = await supabase
      .from("audit_log" as never)
      .select("id, action, table_name, user_email, created_at, dados_antes, dados_depois")
      .eq("record_id", a.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setAuditLoading(false);
    if (error) { toast.error(error.message); return; }
    setAuditRows((data as unknown as AuditRow[]) ?? []);
  };

  const cadastrarPacienteRapido = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!novoPac.nome.trim()) { toast.error("Informe o nome"); return; }
    if (!novoPac.data_nascimento) { toast.error("Informe a data de nascimento"); return; }
    if (!novoPac.telefone.trim()) { toast.error("Informe o telefone"); return; }
    if (novoPac.cpf.trim() && !isCPFValido(novoPac.cpf)) {
      toast.error("CPF inválido"); return;
    }
    setSavingPac(true);
    const { data, error } = await supabase
      .from("pacientes")
      .insert({
        clinica_id: clinicaAtual.clinica_id,
        nome: novoPac.nome.trim(),
        cpf: novoPac.cpf.trim() ? somenteDigitos(novoPac.cpf) : null,
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
      .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,observacoes,token_publico,data_pagamento")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("inicio", { ascending: false });
    const statusEspecifico = filtroStatus !== "todos" && filtroStatus !== "livres";
    if (statusEspecifico) {
      // Quando filtra por situação específica, busca em todo o histórico
      q = q.eq("status", filtroStatus as Status).limit(1000);
    } else if (apenasData) {
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const fimDia = dataFim ?? dataRef;
      const fim = new Date(`${fimDia}T23:59:59`).toISOString();
      q = q.gte("inicio", inicio).lte("inicio", fim);
    } else {
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const f = new Date(`${(dataFim ?? dataRef)}T00:00:00`);
      if (!dataFim) f.setDate(f.getDate() + 30);
      else f.setHours(23, 59, 59);
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
    const [m, p, e, me, pr, sr, mc] = await Promise.all([
      supabase.from("medicos").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
      supabase.from("especialidades").select("id,nome").order("nome"),
      supabase.from("medico_especialidades").select("medico_id,especialidade_id"),
      supabase.from("procedimentos").select("id,nome,tipo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(5000),
      supabase.from("procedimento_split_regras").select("medico_id,procedimento_id").eq("clinica_id", clinicaAtual.clinica_id).not("medico_id", "is", null),
      supabase.from("medico_convenios").select("medico_id,nome,ativo").eq("ativo", true),
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
    const medicosIds = new Set(((m.data ?? []) as Medico[]).map((x) => x.id));
    const nm = new Map<string, Set<string>>();
    for (const r of (mc.data ?? []) as Array<{ medico_id: string; nome: string }>) {
      if (!r.medico_id || !medicosIds.has(r.medico_id)) continue;
      if (!nm.has(r.medico_id)) nm.set(r.medico_id, new Set());
      nm.get(r.medico_id)!.add(normalizar(r.nome));
    }
    setProcNomesPorMedico(nm);
  };

  useEffect(() => { loadRef(); }, [clinicaAtual?.clinica_id]);
  useEffect(() => { load(); }, [clinicaAtual?.clinica_id, dataRef, dataFim, apenasData, filtroStatus]);

  // Perfil de médico: trava o filtro no próprio profissional
  useEffect(() => {
    if (isMedicoOnly && medicoLogadoId) setFiltroMedico(medicoLogadoId);
  }, [isMedicoOnly, medicoLogadoId]);

  // Verifica se o usuário logado é médico da clínica atual (para liberar status "Realizado")
  useEffect(() => {
    (async () => {
      if (!user?.id || !clinicaAtual) { setUsuarioEhMedico(false); return; }
      const { data } = await supabase
        .from("medicos")
        .select("id")
        .eq("user_id", user.id)
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      setUsuarioEhMedico(!!data);
    })();
  }, [user?.id, clinicaAtual?.clinica_id]);

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
    const algumPago = itens.some(i => pagosSet.has(i.id));
    if (algumPago) {
      toast.info("Há atendimentos já pagos na seleção. Desmarque-os antes de cobrar.");
      return;
    }
    // busca valores dos procedimentos pelo nome (todas as formas de pagamento)
    const { data: procs } = await supabase
      .from("procedimentos")
      .select("nome,valor_dinheiro,valor_pix,valor_padrao,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_dinheiro_pix")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .limit(5000);
    const acharProc = (nomeProc: string) => {
      const alvo = normalizar(nomeProc);
      return (procs ?? []).find(p => normalizar(p.nome ?? "") === alvo)
        ?? (procs ?? []).find(p => normalizar(p.nome ?? "").includes(alvo));
    };
    let totalDinheiro = 0, totalPix = 0, totalDebito = 0, totalCredito = 0;
    for (const it of itens) {
      const p: any = acharProc(it.procedimento ?? "CONSULTA");
      const valorCartao = valorCartaoProcedimento(p);
      totalDinheiro += primeiroValorValido(p?.valor_dinheiro, p?.valor_dinheiro_pix, p?.valor_padrao);
      totalPix      += valorCartao;
      totalDebito   += valorCartao;
      totalCredito  += valorCartao;
    }
    const paciente = itens[0].paciente_nome;
    const desc = `${paciente} — ${itens.map(i => (i.procedimento ?? "CONSULTA")).join(" + ")} (${itens.length} itens)`;
    const opcoes: FormaOpcao[] = [
      { forma: "dinheiro", label: "Dinheiro", valor: totalDinheiro },
      { forma: "pix", label: "Pix", valor: totalPix },
      { forma: "cartao_debito", label: "Cartão de Débito", valor: totalDebito },
      { forma: "cartao_credito", label: "Cartão de Crédito", valor: totalCredito },
    ];
    setFormaPagOpcoes(opcoes);
    setFormaPagCtx({ agId: itens.map(i => i.id).join(","), desc });
    setFormaPagOpen(true);
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
      data_pagamento: a.data_pagamento ?? "",
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
      data_pagamento: a.data_pagamento ?? "",
    });
    setOpen(true);
  };

  const submit = async (e: FormEvent, irParaPagamento = false) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!form.paciente_nome.trim()) { toast.error("Informe o paciente"); return; }
    if (!form.paciente_id) {
      toast.error("Selecione um paciente cadastrado na lista ou clique em \"Cadastrar agora\" para criar o cadastro antes de salvar.");
      return;
    }
    if (!form.inicio || !form.fim) { toast.error("Defina início e fim"); return; }
    if (new Date(form.fim) <= new Date(form.inicio)) { toast.error("O horário final deve ser após o inicial"); return; }
    if (!form.procedimento.trim()) { toast.error("Selecione o procedimento"); return; }
    if (editing && pagosSet.has(editing.id) && form.paciente_nome.trim() !== editing.paciente_nome) {
      toast.error("Não é permitido alterar o nome do paciente em agendamento já pago.");
      return;
    }
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
      data_pagamento: form.data_pagamento ? form.data_pagamento : null,
    };
    let novoId: string | null = editing?.id ?? null;
    if (editing) {
      const { error } = await supabase.from("agendamentos").update(payload).eq("id", editing.id);
      if (error) { setSaving(false); toast.error(error.message); return; }
    } else {
      const { data: novo, error } = await supabase.from("agendamentos").insert(payload).select("id").single();
      if (error || !novo) { setSaving(false); toast.error(error?.message ?? "Erro ao salvar"); return; }
      novoId = novo.id;
    }
    setSaving(false);
    toast.success("Salvo"); setOpen(false); await load();
    if (irParaPagamento && novoId) {
      const nomeBusca = normalizar((payload.procedimento ?? "CONSULTA").trim());
      const { data: lista } = await supabase
        .from("procedimentos")
        .select("nome,valor_dinheiro,valor_pix,valor_padrao,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_dinheiro_pix")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .limit(5000);
      const proc: any = (lista ?? []).find((p) => normalizar(p.nome ?? "") === nomeBusca)
        ?? (lista ?? []).find((p) => normalizar(p.nome ?? "").includes(nomeBusca));
      const valorCartao = valorCartaoProcedimento(proc);
      const vDinheiro = primeiroValorValido(proc?.valor_dinheiro, proc?.valor_dinheiro_pix, proc?.valor_padrao);
      const vPix = valorCartao;
      const vDebito = valorCartao;
      const vCredito = valorCartao;
      const opcoes: FormaOpcao[] = [
        { forma: "dinheiro", label: "Dinheiro", valor: vDinheiro },
        { forma: "pix", label: "Pix", valor: vPix },
        { forma: "cartao_debito", label: "Cartão de Débito", valor: vDebito },
        { forma: "cartao_credito", label: "Cartão de Crédito", valor: vCredito },
      ];
      setFormaPagOpcoes(opcoes);
      setFormaPagCtx({ agId: novoId, desc: `${payload.paciente_nome} — ${payload.procedimento ?? "CONSULTA"}` });
      setFormaPagOpen(true);
    }
  };

  const remove = async (a: Agendamento) => {
    if (!confirm(`Excluir agendamento de ${a.paciente_nome}?`)) return;
    const { error } = await supabase.from("agendamentos").delete().eq("id", a.id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); await load(); }
  };

  const mudarStatus = async (a: Agendamento, status: Status) => {
    if (status === "realizado" && !usuarioEhMedico) {
      toast.error("Apenas o médico responsável pode marcar como 'Realizado'.");
      return;
    }
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
      .select("nome,valor_dinheiro,valor_pix,valor_padrao,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_dinheiro_pix")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .limit(5000);
    const proc = (lista ?? []).find((p) => normalizar(p.nome ?? "") === nomeBusca)
      ?? (lista ?? []).find((p) => normalizar(p.nome ?? "").includes(nomeBusca));
    const valorCartao = valorCartaoProcedimento(proc);
    const vDinheiro = primeiroValorValido(proc?.valor_dinheiro, proc?.valor_dinheiro_pix, proc?.valor_padrao);
    const vPix = valorCartao;
    const vDebito = valorCartao;
    const vCredito = valorCartao;
    const opcoes: FormaOpcao[] = [
      { forma: "dinheiro", label: "Dinheiro", valor: vDinheiro },
      { forma: "pix", label: "Pix", valor: vPix },
      { forma: "cartao_debito", label: "Cartão de Débito", valor: vDebito },
      { forma: "cartao_credito", label: "Cartão de Crédito", valor: vCredito },
    ];
    setFormaPagOpcoes(opcoes);
    setFormaPagCtx({ agId: a.id, desc: `${a.paciente_nome} — ${a.procedimento ?? "CONSULTA"}` });
    setFormaPagOpen(true);
  };

  const escolherForma = (op: FormaOpcao) => {
    if (!formaPagCtx) return;
    const ids = formaPagCtx.agId.split(",").filter(Boolean);
    const principal = ids[0] ?? null;
    const extras = ids.slice(1);
    setPagamentoDesc(formaPagCtx.desc);
    setPagamentoValor(op.valor > 0 ? op.valor.toFixed(2) : "");
    setPagamentoForma(op.forma);
    setPagamentoAgId(principal);
    setPagamentoExtraIds(extras);
    setFormaPagOpen(false);
    setPagamentoOpen(true);
  };

  const escolherMisto = () => {
    if (!formaPagCtx) return;
    const ids = formaPagCtx.agId.split(",").filter(Boolean);
    const principal = ids[0] ?? null;
    const extras = ids.slice(1);
    // pega o maior valor disponível como referência (geralmente todas as formas têm valor próximo)
    const valorRef = Math.max(0, ...formaPagOpcoes.map((o) => o.valor));
    setPagamentoDesc(formaPagCtx.desc);
    setPagamentoValor(valorRef > 0 ? valorRef.toFixed(2) : "");
    setPagamentoForma("__misto__");
    setPagamentoAgId(principal);
    setPagamentoExtraIds(extras);
    setFormaPagOpen(false);
    setPagamentoOpen(true);
  };

  const imprimirGR = async (a: Agendamento) => {
    if (!clinicaAtual) return;
    try {
      await printGuiaAtendimento({
        agendamentoId: a.id,
        clinicaId: clinicaAtual.clinica_id,
        usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
        usuarioId: user?.id ?? null,
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
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };
  const fmtDiaSemana = (iso: string) => DIAS_SEMANA[new Date(iso).getDay()];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Agendas
          </h1>
          <p className="text-sm text-muted-foreground">Filtre e gerencie os agendamentos da clínica.</p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-full border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("dia")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${viewMode === "dia" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("medico")}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${viewMode === "medico" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Por médico
            </button>
          </div>
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
            <Button onClick={openNew} disabled={!clinicaAtual} className="bg-primary hover:bg-primary/90 text-primary-foreground">
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
                    placeholder="Nome do paciente" required
                    readOnly={editing ? pagosSet.has(editing.id) : false}
                    disabled={editing ? pagosSet.has(editing.id) : false}
                  />
                  <Button type="button" variant="outline" size="icon" title="Cadastrar novo paciente"
                    disabled={editing ? pagosSet.has(editing.id) : false}
                    onClick={() => { setNovoPac(p => ({ ...p, nome: form.paciente_nome })); setNovoPacOpen(true); }}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
                <datalist id="lista-pacientes">
                  {pacientes.map(p => <option key={p.id} value={p.nome} />)}
                </datalist>
                {editing && pagosSet.has(editing.id) && (
                  <p className="text-xs text-amber-600">
                    Este agendamento já está pago — o nome do paciente não pode ser alterado.
                  </p>
                )}
                {form.paciente_nome && !form.paciente_id && (
                  <p className="text-xs text-amber-600 font-medium">
                    Paciente não cadastrado — use o botão ao lado para cadastrar antes de salvar.
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
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Data consulta/exame</Label>
                    <Input type="datetime-local" value={form.inicio} onChange={(e) => setForm(f => ({ ...f, inicio: e.target.value, fim: calcFimAuto(e.target.value, f.medico_id) }))} required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data de pagamento</Label>
                    <Input
                      type="date"
                      value={form.data_pagamento}
                      onChange={(e) => setForm(f => ({ ...f, data_pagamento: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Data de pagamento é preenchida automaticamente quando o pagamento for registrado. Pode ser ajustada manualmente se necessário.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Procedimento</Label>
                {form.medico_id && (procPorMedico.get(form.medico_id)?.size || procNomesPorMedico.get(form.medico_id)?.size) ? (
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
                      const nomesDoMedico = form.medico_id ? procNomesPorMedico.get(form.medico_id) : undefined;
                      const temConfig = (idsDoMedico && idsDoMedico.size > 0) || (nomesDoMedico && nomesDoMedico.size > 0);
                      const filtrados = temConfig
                        ? procedimentosList.filter((p) =>
                            (idsDoMedico?.has(p.id) ?? false) ||
                            (nomesDoMedico?.has(normalizar(p.nome)) ?? false)
                          )
                        : procedimentosList;
                      // Deduplicar pelo nome normalizado (evita "CONSULTA" duplicada quando o
                      // procedimento existe tanto na tabela procedimentos quanto em medico_convenios).
                      const vistos = new Set<string>();
                      return filtrados
                        .filter((p) => {
                          const k = normalizar(p.nome);
                          if (vistos.has(k)) return false;
                          vistos.add(k);
                          return true;
                        })
                        .map((p) => ({ value: p.nome, label: p.nome }));
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

      <Dialog open={formaPagOpen} onOpenChange={setFormaPagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forma de pagamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">{formaPagCtx?.desc}</p>
          <div className="grid gap-2 mt-2">
            {formaPagOpcoes.map((op) => (
              <Button
                key={op.forma}
                variant="outline"
                className="justify-between h-12"
                onClick={() => escolherForma(op)}
              >
                <span>{op.label}</span>
                <span className="font-semibold">
                  {op.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </Button>
            ))}
            <Button
              variant="default"
              className="justify-center h-12 mt-1 bg-primary"
              onClick={escolherMisto}
            >
              💰 Mais de uma forma de pagamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LancamentoDialog
        open={pagamentoOpen}
        onOpenChange={(v) => { setPagamentoOpen(v); if (!v) { setPagamentoAgId(null); setPagamentoExtraIds([]); } }}
        tipo="receita"
        initialDescricao={pagamentoDesc}
        initialValor={pagamentoValor}
        initialFormaPagamento={pagamentoForma}
        agendamentoId={pagamentoAgId}
        onSavedWithData={async (dados) => {
          if (!pagamentoAgId || !clinicaAtual) return;
          const agId = pagamentoAgId;
          // marca todos os agendamentos da cobrança agrupada como pagos
          if (pagamentoExtraIds.length > 0) {
            // insere linhas-sombra (valor 0) para que os demais agendamentos
            // apareçam como "pagos" sem duplicar receita financeira
            const sombras = pagamentoExtraIds.map((extraId) => ({
              clinica_id: clinicaAtual.clinica_id,
              tipo: "receita" as const,
              descricao: `${pagamentoDesc} — vinculado ao pagamento agrupado`,
              valor: 0,
              data: new Date().toISOString().slice(0, 10),
              forma_pagamento: dados.forma_pagamento,
              status: "confirmado" as const,
              agendamento_id: extraId,
              observacoes: `Pagamento agrupado com agendamento ${agId}`,
            }));
            const { error: errSombras } = await supabase.from("fin_lancamentos").insert(sombras);
            if (errSombras) {
              toast.error("Pagamento salvo, mas falhou ao vincular itens extras: " + errSombras.message);
            }
          }
          setPagosSet((prev) => {
            const next = new Set(prev);
            next.add(agId);
            for (const id of pagamentoExtraIds) next.add(id);
            return next;
          });
          // Avança o fluxo do paciente: após o pagamento no caixa, segue para triagem.
          try {
            const todos = [agId, ...pagamentoExtraIds];
            const { error: errFluxo } = await supabase
              .from("agendamentos")
              .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
              .in("id", todos);
            if (errFluxo) {
              toast.error("Pagamento salvo, mas falhou ao avançar o fluxo: " + errFluxo.message);
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Falha ao avançar o fluxo");
          }
          // limpa seleção após cobrança agrupada
          if (pagamentoExtraIds.length > 0) {
            setSelecionados(new Set());
          }
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
            toast.success("Pagamento registrado e GR enviado para impressão.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Falha ao imprimir GR");
          }
          setPagamentoAgId(null);
          setPagamentoExtraIds([]);
        }}
      />

      <Dialog open={novoPacOpen} onOpenChange={setNovoPacOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastro rápido de paciente</DialogTitle>
          </DialogHeader>
          <form onSubmit={cadastrarPacienteRapido} className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={novoPac.nome} onChange={(e) => setNovoPac(p => ({ ...p, nome: e.target.value }))} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input
                  value={novoPac.cpf}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                    let v = d;
                    if (d.length > 9) v = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
                    else if (d.length > 6) v = `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
                    else if (d.length > 3) v = `${d.slice(0,3)}.${d.slice(3)}`;
                    setNovoPac(p => ({ ...p, cpf: v }));
                  }}
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="000.000.000-00"
                  className={novoPac.cpf && somenteDigitos(novoPac.cpf).length === 11 && !isCPFValido(novoPac.cpf) ? "border-rose-500 focus-visible:ring-rose-500" : ""}
                />
                {novoPac.cpf && somenteDigitos(novoPac.cpf).length === 11 && !isCPFValido(novoPac.cpf) && (
                  <p className="text-[11px] text-rose-600">CPF inválido</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Nascimento *</Label>
                <Input type="date" required value={novoPac.data_nascimento} onChange={(e) => setNovoPac(p => ({ ...p, data_nascimento: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Telefone *</Label>
              <Input
                required
                value={novoPac.telefone}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                  let v = d;
                  if (d.length > 10) v = `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
                  else if (d.length > 6) v = `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
                  else if (d.length > 2) v = `(${d.slice(0,2)}) ${d.slice(2)}`;
                  else if (d.length > 0) v = `(${d}`;
                  setNovoPac(p => ({ ...p, telefone: v }));
                }}
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
              />
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

      <Dialog open={!!auditAg} onOpenChange={(o) => { if (!o) { setAuditAg(null); setAuditRows([]); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Histórico de alterações
            </DialogTitle>
            {auditAg && (
              <p className="text-sm text-muted-foreground">
                {auditAg.paciente_nome} — {new Date(auditAg.inicio).toLocaleString("pt-BR")}
              </p>
            )}
          </DialogHeader>
          <div className="overflow-auto flex-1 -mx-6 px-6">
            {auditLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : auditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma alteração registrada para este agendamento.
              </p>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const nomePorEmail = new Map<string, string>(
                    equipeList
                      .filter((m) => m.email && m.nome)
                      .map((m) => [m.email as string, m.nome as string]),
                  );
                  return auditRows.map((r) => {
                  const acaoLabel: Record<string, string> = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Excluiu" };
                  const acaoCor: Record<string, string> = {
                    INSERT: "bg-emerald-100 text-emerald-700",
                    UPDATE: "bg-amber-100 text-amber-700",
                    DELETE: "bg-rose-100 text-rose-700",
                  };
                  const antes = (r.dados_antes ?? {}) as Record<string, unknown>;
                  const depois = (r.dados_depois ?? {}) as Record<string, unknown>;
                  const chaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]))
                    .filter((k) => !["updated_at", "created_at", "fluxo_atualizado_em"].includes(k))
                    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
                  const quem = (r.user_email && nomePorEmail.get(r.user_email)) || r.user_email || "—";
                  return (
                    <div key={r.id} className="rounded-md border p-3 bg-card">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={acaoCor[r.action] ?? ""}>{acaoLabel[r.action] ?? r.action}</Badge>
                          <span className="text-xs font-mono text-muted-foreground">{r.table_name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("pt-BR")} · {quem}
                        </div>
                      </div>
                      {r.action === "UPDATE" && chaves.length > 0 && (
                        <div className="text-xs space-y-1">
                          {chaves.map((k) => (
                            <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                              <span className="font-medium text-muted-foreground">{k}:</span>
                              <span>
                                <span className="line-through text-rose-600">{String(antes[k] ?? "—")}</span>
                                {" → "}
                                <span className="text-emerald-700">{String(depois[k] ?? "—")}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.action === "INSERT" && (
                        <p className="text-xs text-muted-foreground">Registro criado.</p>
                      )}
                      {r.action === "DELETE" && (
                        <p className="text-xs text-muted-foreground">Registro excluído.</p>
                      )}
                    </div>
                  );
                  });
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAuditAg(null); setAuditRows([]); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filtros */}
      <div
        className="rounded-lg border bg-card p-2.5 space-y-2 [--clinic:theme(colors.border)]"
        style={{ ["--clinic" as never]: corClinica }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="space-y-0.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Profissional</Label>
            <MedicoFiltroInput
              medicos={medicos}
              value={filtroMedico}
              onChange={(v) => { if (!isMedicoOnly) setFiltroMedico(v); }}
              disabled={isMedicoOnly}
              onlyMedicoId={isMedicoOnly ? medicoLogadoId : null}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data Ref.</Label>
            <DataRefField
              dataRef={dataRef}
              dataFim={dataFim}
              setDataRef={setDataRef}
              setDataFim={setDataFim}
              shiftData={shiftData}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Dia Semana</Label>
            <Select value={filtroDiaSemana} onValueChange={setFiltroDiaSemana}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {DIAS_SEMANA.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
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
          <div className="space-y-0.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nº Ficha</Label>
            <Input value={filtroFicha} onChange={(e) => setFiltroFicha(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 001" inputMode="numeric" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Especialidade</Label>
            <Select value={filtroEspecialidade} onValueChange={setFiltroEspecialidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {especialidades.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
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
        <div className="flex flex-wrap items-center justify-between gap-2">
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

      {viewMode === "dia" && (
      <>
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
              <TableHead
                className="w-10"
                title="Selecione vários atendimentos do mesmo paciente para cobrar em um único pagamento (use o botão Opções acima)"
              >
                <Checkbox
                  checked={paginados.length > 0 && selecionados.size === paginados.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="w-16">Ficha</TableHead>
              <TableHead className="w-14">Dia</TableHead>
              <TableHead className="w-24">Data</TableHead>
              <TableHead className="w-32">Intervalo</TableHead>
              <TableHead className="min-w-[200px]">Profissional</TableHead>
              <TableHead className="min-w-[200px]">Cliente</TableHead>
              <TableHead className="w-40">Pasta</TableHead>
              <TableHead className="w-20 text-center">Alertas</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !clinicaAtual ? (
              <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
            ) : paginados.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Nenhum agendamento encontrado.</TableCell></TableRow>
            ) : paginados.map((a) => {
              const fichaNum = fichaPorId.get(a.id) ?? "";
              const realizado = a.status === "realizado";
              return (
                <TableRow key={a.id} className={realizado ? "bg-emerald-50 dark:bg-emerald-950/20 [&>td]:py-0 [&>td]:h-7 text-xs" : "[&>td]:py-0 [&>td]:h-7 text-xs"}>
                  <TableCell title="Marque para cobrar este atendimento em um pagamento agrupado">
                    <Checkbox checked={selecionados.has(a.id)} onCheckedChange={() => toggleSel(a.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{fichaNum}</TableCell>
                  <TableCell className="text-sm">{fmtDiaSemana(a.inicio)}</TableCell>
                  <TableCell className="text-sm">{fmtData(a.inicio)}</TableCell>
                  <TableCell>
                     <span className="text-emerald-600 font-medium">{fmtHora(a.inicio)} - {fmtHora(a.fim)}</span>
                  </TableCell>
                  <TableCell className="pr-1 align-middle">
                    <span className="text-xs uppercase font-medium text-foreground">
                      Dr(a). {medicos.find((m) => m.id === a.medico_id)?.nome ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="pr-1 align-middle">
                    {normalizar(a.paciente_nome) === "disponivel" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openSlot(a)}
                        title="Agendar paciente neste horário"
                        className="h-6 px-2 text-primary hover:text-primary/80 font-medium"
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Agendar cliente
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => abrirInfoPaciente(a.paciente_id, a.paciente_nome)}
                        title="Ver informações do cliente"
                        className="inline-flex items-center gap-1 text-xs uppercase font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {a.status === "confirmado" && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        {a.paciente_nome}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{a.procedimento || "CONSULTA"}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                      {normalizar(a.paciente_nome) === "disponivel" ? (
                        <Badge className="bg-slate-100 text-slate-600 border border-slate-300">Livre</Badge>
                      ) : (
                        <Badge className={STATUS_COR[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                      )}
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
                      title={pagosSet.has(a.id) ? "Pago" : "Pagamento pendente"}
                      onClick={() => cobrarAgendamento(a)}
                      className={`border-2 rounded-sm px-2 ${pagosSet.has(a.id)
                        ? "text-emerald-600 border-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        : "text-rose-600 border-rose-600 hover:text-rose-700 hover:bg-rose-50"}`}
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
                        <DropdownMenuItem onClick={() => abrirAuditoria(a)}>
                          <ShieldCheck className="h-4 w-4 mr-2" /> Auditoria
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
      </>
      )}

      {viewMode === "medico" && (
        <AgendaPorMedicoGrid
          medicoId={filtroMedico === "todos" ? "" : filtroMedico}
          dias={(() => {
            if (!dataFim) return 1;
            const a = new Date(`${dataRef}T12:00:00`).getTime();
            const b = new Date(`${dataFim}T12:00:00`).getTime();
            return Math.min(31, Math.max(1, Math.round((b - a) / 86400000) + 1));
          })()}
          dataRef={dataRef}
          items={items.filter((a) => filtroMedico === "todos" || a.medico_id === filtroMedico)}
          onSlotClick={(a) => openSlot(a)}
          onAgClick={(a) => openEdit(a)}
          fmtHora={fmtHora}
        />
      )}

      <Dialog open={pacInfoOpen} onOpenChange={setPacInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Informações do cliente</DialogTitle>
          </DialogHeader>
          {pacInfoLoading ? (
            <p className="text-sm text-muted-foreground py-4">Carregando…</p>
          ) : pacInfo ? (
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <div className="flex items-center gap-3">
                {pacInfo.foto_url ? (
                  <img src={pacInfo.foto_url} alt={pacInfo.nome} className="h-14 w-14 rounded-full object-cover border" />
                ) : null}
                <div>
                  <div className="font-semibold uppercase">{pacInfo.nome}</div>
                  {pacInfo.numero_pasta && (
                    <div className="text-xs text-muted-foreground">Pasta nº {pacInfo.numero_pasta}</div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <div><span className="text-muted-foreground">CPF: </span>{pacInfo.cpf || "—"}</div>
                <div><span className="text-muted-foreground">Nasc.: </span>{pacInfo.data_nascimento ? new Date(pacInfo.data_nascimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div>
                <div><span className="text-muted-foreground">Telefone: </span>{pacInfo.telefone || "—"}</div>
                <div className="truncate"><span className="text-muted-foreground">Email: </span>{pacInfo.email || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Endereço: </span>{[pacInfo.logradouro, pacInfo.numero, pacInfo.bairro, pacInfo.cidade, pacInfo.estado].filter(Boolean).join(", ") || "—"}</div>
              </div>
              {pacInfo.id && (
                <div className="pt-2">
                  <a href={`/app/clientes?q=${encodeURIComponent(pacInfo.nome)}`} className="text-xs text-primary hover:underline">
                    Abrir ficha completa →
                  </a>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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

function MedicoFiltroInput({
  medicos, value, onChange, disabled, onlyMedicoId,
}: {
  medicos: Medico[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onlyMedicoId?: string | null;
}) {
  const lista = useMemo(
    () => medicos.filter((m) => !onlyMedicoId || m.id === onlyMedicoId),
    [medicos, onlyMedicoId],
  );
  const selecionadoNome = useMemo(
    () => (value === "todos" ? "" : (medicos.find((m) => m.id === value)?.nome ?? "")),
    [medicos, value],
  );
  const [texto, setTexto] = useState(selecionadoNome);
  const [aberto, setAberto] = useState(false);
  useEffect(() => { setTexto(selecionadoNome); }, [selecionadoNome]);

  const norm = (s: string) => normalizar(s);
  const sugestoes = useMemo(() => {
    const t = norm(texto).trim();
    if (!t) return lista.slice(0, 30);
    return lista.filter((m) => norm(m.nome).includes(t)).slice(0, 30);
  }, [lista, texto]);

  return (
    <div className="relative">
      <div className="flex gap-1">
        <Input
          disabled={disabled}
          placeholder="TODOS — digite para buscar"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
        />
        {value !== "todos" && !disabled && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Limpar"
            onClick={() => { onChange("todos"); setTexto(""); }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {aberto && !disabled && sugestoes.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover shadow-md">
          {sugestoes.map((m) => (
            <button
              key={m.id}
              type="button"
              className="block w-full text-left px-2 py-1.5 text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(m.id);
                setTexto(m.nome);
                setAberto(false);
              }}
            >
              {m.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaPorMedicoGrid({
  medicoId, dias, dataRef, items, onSlotClick, onAgClick, fmtHora,
}: {
  medicoId: string;
  dias: number;
  dataRef: string;
  items: Agendamento[];
  onSlotClick: (a: Agendamento) => void;
  onAgClick: (a: Agendamento) => void;
  fmtHora: (iso: string) => string;
}) {
  const diasSemana = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];

  // Lista de dias no intervalo (yyyy-mm-dd)
  const intervaloDias = useMemo(() => {
    const arr: string[] = [];
    const base = new Date(`${dataRef}T12:00:00`);
    for (let i = 0; i < dias; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  }, [dataRef, dias]);

  // Agrupa agendamentos por dia + horário de início
  const porDia = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    for (const a of items) {
      const dia = a.inicio.slice(0, 10);
      if (!intervaloDias.includes(dia)) continue;
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(a);
    }
    for (const arr of map.values()) arr.sort((x, y) => x.inicio.localeCompare(y.inicio));
    return map;
  }, [items, intervaloDias]);

  // Slots de hora de início: união dos horários existentes em todos os dias
  // do intervalo, ou grade padrão de 30min entre 07:00 e 19:00 se vazio.
  const horasInicio = useMemo(() => {
    const set = new Set<string>();
    for (const arr of porDia.values()) {
      for (const a of arr) {
        const d = new Date(a.inicio);
        set.add(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      }
    }
    if (set.size === 0) {
      for (let h = 7; h < 19; h++) {
        set.add(`${String(h).padStart(2, "0")}:00`);
        set.add(`${String(h).padStart(2, "0")}:30`);
      }
    }
    return Array.from(set).sort();
  }, [porDia]);

  const corStatus = (s: Status) => STATUS_COR[s];

  const fmtCabecalho = (yyyymmdd: string) => {
    const d = new Date(`${yyyymmdd}T12:00:00`);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm} — ${diasSemana[d.getDay()]}`;
  };

  return (
    <div className="space-y-3">
      {!medicoId ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Selecione um profissional no filtro acima para visualizar a agenda por médico.
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground border-r" style={{ minWidth: 88 }}>
                  Hora<br />Início
                </th>
                {intervaloDias.map((dia) => (
                  <FragmentDayHeader key={dia} dia={dia} fmtCabecalho={fmtCabecalho} />
                ))}
              </tr>
            </thead>
            <tbody>
              {horasInicio.map((hi) => (
                <tr key={hi} className="border-t">
                  <td className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 text-xs font-mono text-muted-foreground border-r">{hi}</td>
                  {intervaloDias.map((dia) => {
                    const ag = (porDia.get(dia) ?? []).find((a) => {
                      const d = new Date(a.inicio);
                      const k = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      return k === hi;
                    });
                    return (
                      <FragmentDayCell
                        key={dia + hi}
                        ag={ag}
                        dia={dia}
                        hi={hi}
                        onSlotClick={onSlotClick}
                        onAgClick={onAgClick}
                        fmtHora={fmtHora}
                        corStatus={corStatus}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentDayHeader({ dia, fmtCabecalho }: { dia: string; fmtCabecalho: (d: string) => string }) {
  return (
    <>
      <th className="px-2 py-2 text-xs font-semibold text-muted-foreground border-r bg-muted/40" style={{ minWidth: 70 }}>
        Hora<br />Fim
      </th>
      <th className="px-3 py-2 text-xs font-semibold text-foreground border-r bg-muted/40 text-left" style={{ minWidth: 180 }}>
        {fmtCabecalho(dia)}
      </th>
    </>
  );
}

function FragmentDayCell({
  ag, dia, hi, onSlotClick, onAgClick, fmtHora, corStatus,
}: {
  ag: Agendamento | undefined;
  dia: string;
  hi: string;
  onSlotClick: (a: Agendamento) => void;
  onAgClick: (a: Agendamento) => void;
  fmtHora: (iso: string) => string;
  corStatus: (s: Status) => string;
}) {
  const ehLivre = ag && normalizar(ag.paciente_nome) === "disponivel";
  return (
    <>
      <td className="px-2 py-1 text-xs font-mono text-muted-foreground border-r align-middle text-center" style={{ minWidth: 70 }}>
        {ag ? fmtHora(ag.fim) : ""}
      </td>
      <td className="px-1 py-1 border-r align-middle" style={{ minWidth: 180 }}>
        {!ag ? (
          <button
            type="button"
            className="w-full h-8 rounded-md text-xs text-muted-foreground/60 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            title={`Criar agendamento ${dia} ${hi}`}
          >
            +
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (ehLivre ? onSlotClick(ag) : onAgClick(ag))}
            className={`w-full text-left rounded-md px-2 py-1.5 text-xs leading-tight truncate hover:brightness-95 transition ${corStatus(ag.status)}`}
            title={`${ag.paciente_nome} — ${ag.procedimento ?? "CONSULTA"}`}
          >
            {ehLivre ? "+ Agendar" : ag.paciente_nome}
          </button>
        )}
      </td>
    </>
  );
}

function DataRefField({
  dataRef, dataFim, setDataRef, setDataFim, shiftData,
}: {
  dataRef: string;
  dataFim: string | null;
  setDataRef: (v: string) => void;
  setDataFim: (v: string | null) => void;
  shiftData: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "range">(dataFim ? "range" : "single");

  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmt = (s: string) => {
    const d = new Date(`${s}T12:00:00`);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const label = dataFim ? `${fmt(dataRef)} → ${fmt(dataFim)}` : fmt(dataRef);

  return (
    <div className="flex gap-1">
      <Button variant="outline" size="icon" onClick={() => { setDataFim(null); shiftData(-1); }}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="flex-1 justify-start font-normal">
            <CalendarDays className="h-4 w-4 mr-2" /> {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex items-center gap-1 p-2 border-b">
            <Button
              size="sm"
              variant={mode === "single" ? "default" : "outline"}
              onClick={() => setMode("single")}
            >
              Dia
            </Button>
            <Button
              size="sm"
              variant={mode === "range" ? "default" : "outline"}
              onClick={() => setMode("range")}
            >
              Período
            </Button>
            <span className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDataRef(toIso(new Date()));
                setDataFim(null);
                setMode("single");
                setOpen(false);
              }}
            >
              Hoje
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDataRef(toIso(new Date()));
                setDataFim(null);
                setMode("single");
              }}
            >
              Limpar
            </Button>
          </div>
          {mode === "single" ? (
            <Calendar
              mode="single"
              selected={new Date(`${dataRef}T12:00:00`)}
              onSelect={(d) => {
                if (!d) return;
                setDataRef(toIso(d));
                setDataFim(null);
                setOpen(false);
              }}
              className="p-3 pointer-events-auto"
            />
          ) : (
            <Calendar
              mode="range"
              selected={{
                from: new Date(`${dataRef}T12:00:00`),
                to: dataFim ? new Date(`${dataFim}T12:00:00`) : undefined,
              }}
              onSelect={(r) => {
                if (!r?.from) return;
                setDataRef(toIso(r.from));
                setDataFim(r.to ? toIso(r.to) : null);
              }}
              numberOfMonths={2}
              className="p-3 pointer-events-auto"
            />
          )}
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon" onClick={() => { setDataFim(null); shiftData(1); }}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
