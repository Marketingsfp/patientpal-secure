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
import { ProcedimentoCell } from "@/components/agenda/procedimento-cell";
import { PatientSearchInput } from "@/components/patient-search-input";
import {
  CalendarDays, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search, X,
  MoreHorizontal, Star, Flag, Printer, Download, Video, UserPlus, Clock, DollarSign, ShieldCheck, BadgeCheck, IdCard,
} from "lucide-react";
import { printGuiaAtendimento, printGuiaAtendimentoAgrupada } from "@/lib/print-gr";
import { VoiceInput } from "@/components/voice-input";
import { exportToExcel } from "@/lib/export-csv";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { listarEquipe } from "@/lib/equipe.functions";
import { IdadeIcon } from "@/components/idade-icon";

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
type Medico = { id: string; nome: string; sexo?: string | null };
type Especialidade = { id: string; nome: string };
type Paciente = { id: string; nome: string };
type ProcedimentoRef = { id: string; nome: string; tipo: string | null };

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

async function fetchProcedimentosAgenda(clinicaId: string): Promise<ProcedimentoRef[]> {
  const pageSize = 1000;
  const rows: ProcedimentoRef[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("procedimentos")
      .select("id,nome,tipo")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as ProcedimentoRef[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

type DescontoConvenio =
  | { tipo: "percentual"; valor: number }
  | { tipo: "valor"; valor: number }
  | { tipo: "gratuidade"; valor: 0 };

type ConvenioInfo = {
  convenioNome: string;
  emDia: boolean;
  parcelasAtrasadas: number;
  desconto: DescontoConvenio | null;
};

function aplicarDesconto(valor: number, d: DescontoConvenio): number {
  if (d.tipo === "gratuidade") return 0;
  if (d.tipo === "percentual") return Math.max(0, valor * (1 - Number(d.valor) / 100));
  return Math.max(0, valor - Number(d.valor));
}

async function obterInfoConvenioPaciente(params: {
  clinicaId: string;
  pacienteId: string | null | undefined;
  medicoId: string | null | undefined;
  procedimentoNome: string;
}): Promise<ConvenioInfo | null> {
  const { clinicaId, pacienteId, medicoId, procedimentoNome } = params;
  if (!pacienteId) return null;

  // 1) Contrato ativo: paciente como titular OU dependente ativo
  const { data: titularContratos } = await supabase
    .from("contratos_assinatura")
    .select("id,convenio_id,cb_convenios(nome)")
    .eq("clinica_id", clinicaId)
    .eq("status", "ativo")
    .eq("paciente_id", pacienteId)
    .limit(5);
  let contrato: { id: string; convenio_id: string | null; cb_convenios: { nome: string } | null } | null =
    (titularContratos ?? [])[0] as any ?? null;

  if (!contrato) {
    const { data: deps } = await supabase
      .from("contrato_dependentes")
      .select("contrato_id,ativo,contratos_assinatura!inner(id,clinica_id,status,convenio_id,cb_convenios(nome))")
      .eq("paciente_id", pacienteId)
      .eq("ativo", true)
      .limit(5);
    const cand = ((deps ?? []) as any[])
      .map((d) => d.contratos_assinatura)
      .find((c: any) => c && c.clinica_id === clinicaId && c.status === "ativo");
    if (cand) contrato = cand;
  }
  if (!contrato || !contrato.convenio_id) return null;

  const convenioNome = contrato.cb_convenios?.nome ?? "Convênio";

  // 2) Verifica mensalidades em atraso do contrato
  const hojeStr = new Date().toISOString().slice(0, 10);
  const { data: mens } = await supabase
    .from("contrato_mensalidades")
    .select("status,vencimento")
    .eq("contrato_id", contrato.id)
    .in("status", ["pendente", "aberto", "atrasado"])
    .lte("vencimento", hojeStr);
  const parcelasAtrasadas = (mens ?? []).length;
  const emDia = parcelasAtrasadas === 0;

  // 3) Busca procedimento_id e especialidade do médico
  const procNorm = (procedimentoNome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const { data: procs } = await supabase
    .from("procedimentos")
    .select("id,nome")
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .limit(5000);
  const procRow = (procs ?? []).find(
    (p: any) => (p.nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === procNorm,
  ) ?? (procs ?? []).find(
    (p: any) => (p.nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(procNorm),
  );
  const procedimentoId = (procRow as any)?.id ?? null;

  let especialidadeId: string | null = null;
  if (medicoId) {
    const { data: med } = await supabase
      .from("medicos")
      .select("especialidade_id")
      .eq("id", medicoId)
      .maybeSingle();
    especialidadeId = (med as any)?.especialidade_id ?? null;
  }

  // 4) Benefícios aplicáveis para o convênio
  const { data: beneficios } = await supabase
    .from("cb_beneficios")
    .select("escopo,procedimento_id,especialidade_id,tipo_desconto,valor_desconto,ativo")
    .eq("clinica_id", clinicaId)
    .eq("convenio_id", contrato.convenio_id)
    .eq("ativo", true);
  const aplicaveis = ((beneficios ?? []) as any[]).filter((b) => {
    if (b.escopo === "servico") return procedimentoId && b.procedimento_id === procedimentoId;
    if (b.escopo === "especialidade") return especialidadeId && b.especialidade_id === especialidadeId;
    return false;
  });

  // Prioridade: gratuidade > maior percentual > maior valor absoluto
  let desconto: DescontoConvenio | null = null;
  const grat = aplicaveis.find((b) => b.tipo_desconto === "gratuidade");
  if (grat) {
    desconto = { tipo: "gratuidade", valor: 0 };
  } else {
    const perc = aplicaveis.filter((b) => b.tipo_desconto === "percentual");
    const vals = aplicaveis.filter((b) => b.tipo_desconto === "valor");
    const maiorPerc = perc.reduce((m, b) => Math.max(m, Number(b.valor_desconto) || 0), 0);
    const maiorVal = vals.reduce((m, b) => Math.max(m, Number(b.valor_desconto) || 0), 0);
    if (maiorPerc > 0) desconto = { tipo: "percentual", valor: maiorPerc };
    else if (maiorVal > 0) desconto = { tipo: "valor", valor: maiorVal };
  }

  return { convenioNome, emDia, parcelasAtrasadas, desconto };
}

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
  const [apenasData, setApenasData] = useState(true);
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
  const [nascMap, setNascMap] = useState<Map<string, string | null>>(new Map());
  const [convenioMap, setConvenioMap] = useState<Map<string, string>>(new Map());
  const [etapaMap, setEtapaMap] = useState<Map<string, string>>(new Map());
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [exames, setExames] = useState<{ id: string; nome: string }[]>([]);
  const [procedimentosList, setProcedimentosList] = useState<{ id: string; nome: string }[]>([]);
  const [procPorMedico, setProcPorMedico] = useState<Map<string, Set<string>>>(new Map());
  const [procOpcoesPorMedico, setProcOpcoesPorMedico] = useState<Map<string, { id: string; nome: string }[]>>(new Map());
  const [procNomesPorMedico, setProcNomesPorMedico] = useState<Map<string, Set<string>>>(new Map());
  // Ranking de procedimentos mais usados por médico (nome normalizado -> contagem)
  const [rankingPorMedico, setRankingPorMedico] = useState<Map<string, Map<string, number>>>(new Map());
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [medicoEspec, setMedicoEspec] = useState<Map<string, Set<string>>>(new Map());
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agendamento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  // Reagendamento
  const [reagendandoAg, setReagendandoAg] = useState<Agendamento | null>(null);
  const [reagSalvando, setReagSalvando] = useState(false);
  // Reagendamento em lote (vários pacientes para outra agenda)
  const [reagLoteSalvando, setReagLoteSalvando] = useState(false);
  // Ids dos pacientes selecionados em modo de reagendamento em lote (mesmo fluxo do individual: clicar num slot DISPONÍVEL)
  const [reagLoteIds, setReagLoteIds] = useState<string[] | null>(null);

  const iniciarReagendamento = (a: Agendamento) => {
    if (a.status === "realizado") {
      toast.error("Atendimento já realizado — peça ao financeiro para estornar antes de reagendar.");
      return;
    }
    setReagendandoAg(a);
    toast.info("Selecione um horário disponível na agenda para confirmar o reagendamento.");
  };
  const cancelarReagendamento = () => setReagendandoAg(null);

  const confirmarReagendamentoNoSlot = async (slot: Agendamento) => {
    const origem = reagendandoAg;
    if (!origem || reagSalvando) return;
    if (slot.id === origem.id) { toast.info("Esse já é o horário atual."); return; }
    if (normalizar(slot.paciente_nome) !== "disponivel") {
      toast.error("Esse horário não está disponível. Escolha um slot DISPONÍVEL.");
      return;
    }
    setReagSalvando(true);
    const obsAnt = origem.observacoes ?? "";
    const trilha = `[Reagendado em ${new Date().toLocaleString("pt-BR")}] de ${new Date(origem.inicio).toLocaleString("pt-BR")} para ${new Date(slot.inicio).toLocaleString("pt-BR")}`;
    const novasObs = obsAnt ? `${obsAnt}\n${trilha}` : trilha;
    // 1) Libera a ficha de origem (vira DISPONÍVEL no horário atual)
    const { error: e1 } = await supabase.from("agendamentos").update({
      paciente_id: null,
      paciente_nome: "DISPONÍVEL",
      status: "agendado",
      procedimento: null,
      observacoes: null,
      data_pagamento: null,
    } as never).eq("id", origem.id);
    if (e1) { setReagSalvando(false); toast.error(e1.message); return; }
    // 2) Coloca a paciente na ficha de destino (slot escolhido), preservando o horário do slot
    const { error: e2 } = await supabase.from("agendamentos").update({
      paciente_id: origem.paciente_id ?? null,
      paciente_nome: origem.paciente_nome,
      procedimento: origem.procedimento ?? null,
      status: "agendado",
      observacoes: novasObs,
      data_pagamento: origem.data_pagamento ?? null,
    } as never).eq("id", slot.id);
    if (e2) { setReagSalvando(false); toast.error(e2.message); return; }
    // 3) Transfere lançamentos financeiros (pagamento) da ficha de origem para a de destino,
    //    para que o ícone de "pago" continue aparecendo na nova ficha.
    await supabase.from("fin_lancamentos")
      .update({ agendamento_id: slot.id } as never)
      .eq("agendamento_id", origem.id);
    setReagSalvando(false);
    setReagendandoAg(null);
    toast.success(`Reagendado para ${new Date(slot.inicio).toLocaleString("pt-BR")}.`);
    await load();
  };

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
    // 1) histórico do próprio agendamento
    const { data: agAudit, error } = await supabase
      .from("audit_log" as never)
      .select("id, action, table_name, user_email, created_at, dados_antes, dados_depois")
      .eq("record_id", a.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { setAuditLoading(false); toast.error(error.message); return; }
    // 2) lançamentos financeiros vinculados ao agendamento (para status do repasse médico)
    const { data: lancs } = await supabase
      .from("fin_lancamentos")
      .select("id")
      .eq("agendamento_id", a.id);
    const lancIds = (lancs ?? []).map((l) => l.id);
    let lancAudit: AuditRow[] = [];
    if (lancIds.length > 0) {
      const { data: la } = await supabase
        .from("audit_log" as never)
        .select("id, action, table_name, user_email, created_at, dados_antes, dados_depois")
        .in("record_id", lancIds)
        .eq("table_name", "fin_lancamentos")
        .order("created_at", { ascending: false })
        .limit(200);
      lancAudit = (la as unknown as AuditRow[]) ?? [];
    }
    const todos = [...((agAudit as unknown as AuditRow[]) ?? []), ...lancAudit]
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    setAuditLoading(false);
    setAuditRows(todos);
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
      .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,observacoes,token_publico,data_pagamento,fluxo_etapa")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("inicio", { ascending: false });
    // "agendado" agora significa "qualquer ficha com paciente alocado",
    // então não restringe por status no servidor — filtra em memória.
    const statusEspecifico =
      filtroStatus !== "todos" && filtroStatus !== "livres" && filtroStatus !== "agendado";
    if (statusEspecifico) {
      q = q.eq("status", filtroStatus as Status).limit(1000);
    }
    if (apenasData) {
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const fimDia = dataFim ?? dataRef;
      const fim = new Date(`${fimDia}T23:59:59`).toISOString();
      q = q.gte("inicio", inicio).lte("inicio", fim);
    } else if (!statusEspecifico) {
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
    setEtapaMap(new Map(((data ?? []) as Array<{ id: string; fluxo_etapa?: string | null }>)
      .map((r) => [r.id, r.fluxo_etapa ?? "aguardando_recepcao"] as [string, string])));
    // Busca data_nascimento dos pacientes para exibir ícone de idade
    const pacIds = Array.from(new Set(
      (data ?? [])
        .map((a: any) => a.paciente_id as string | null)
        .filter((x): x is string => !!x),
    ));
    if (pacIds.length) {
      const { data: nasc } = await supabase
        .from("pacientes")
        .select("id,data_nascimento")
        .in("id", pacIds);
      const map = new Map<string, string | null>();
      (nasc ?? []).forEach((p: any) => map.set(p.id, p.data_nascimento ?? null));
      setNascMap(map);
    } else {
      setNascMap(new Map());
    }
    // Busca contratos de convênio (cartão benefícios) ativos para sinalizar na agenda
    if (pacIds.length) {
      const { data: contratos } = await supabase
        .from("contratos_assinatura")
        .select("paciente_id,status,cb_convenios(nome)")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("status", "ativo")
        .in("paciente_id", pacIds);
      const cmap = new Map<string, string>();
      ((contratos ?? []) as Array<{ paciente_id: string; cb_convenios: { nome: string } | null }>)
        .forEach((c) => {
          if (c.paciente_id && !cmap.has(c.paciente_id)) {
            cmap.set(c.paciente_id, c.cb_convenios?.nome ?? "Convênio");
          }
        });
      setConvenioMap(cmap);
    } else {
      setConvenioMap(new Map());
    }
    // Marca agendamentos pagos (receita vinculada em fin_lancamentos)
    const ids = (data ?? []).map((a) => a.id);
    // Fichas DISPONÍVEIS não podem ser exibidas como "Pago" — ignoramos
    // qualquer lançamento órfão que tenha ficado vinculado a uma ficha
    // que foi posteriormente liberada por um reagendamento.
    const idsComPaciente = new Set(
      ((data ?? []) as Array<{ id: string; paciente_nome: string }>)
        .filter((a) => normalizar(a.paciente_nome) !== "disponivel")
        .map((a) => a.id),
    );
    if (ids.length) {
      const { data: pg } = await supabase
        .from("fin_lancamentos")
        .select("agendamento_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .in("agendamento_id", ids);
      setPagosSet(new Set(((pg ?? []) as Array<{ agendamento_id: string | null }>)
        .map((r) => r.agendamento_id)
        .filter((x): x is string => !!x && idsComPaciente.has(x))));
    } else {
      setPagosSet(new Set());
    }
  };

  const loadRef = async () => {
    if (!clinicaAtual) return;
    const [m, p, e, me, pr, sr, mc, mp] = await Promise.all([
      supabase.from("medicos").select("id,nome,sexo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      supabase.from("pacientes").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(500),
      supabase.from("especialidades").select("id,nome").order("nome"),
      supabase.from("medico_especialidades").select("medico_id,especialidade_id"),
      supabase.from("procedimentos").select("id,nome,tipo").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome").limit(5000),
      supabase.from("procedimento_split_regras").select("medico_id,procedimento_id").eq("clinica_id", clinicaAtual.clinica_id).not("medico_id", "is", null),
      supabase.from("medico_convenios").select("medico_id,nome,ativo").eq("ativo", true),
      supabase.from("medico_procedimentos").select("medico_id,procedimento_id,created_at"),
    ]);
    setMedicos((m.data ?? []) as Medico[]);
    setPacientes((p.data ?? []) as Paciente[]);
    setEspecialidades((e.data ?? []) as Especialidade[]);
    const todos = (pr.data ?? []) as { id: string; nome: string; tipo: string | null }[];
    {
      const ex = todos.filter((x) => x.tipo === "exame");
      const vistos = new Set<string>();
      const unicos: { id: string; nome: string }[] = [];
      for (const e of ex) {
        const k = normalizar(e.nome);
        if (vistos.has(k)) continue;
        vistos.add(k);
        unicos.push({ id: e.id, nome: e.nome });
      }
      setExames(unicos);
    }
    setProcedimentosList(todos.map(({ id, nome }) => ({ id, nome })));
    const procedimentosPorId = new Map(todos.map((p) => [p.id, { id: p.id, nome: p.nome }]));
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
    const procOpcoesMap = new Map<string, { id: string; nome: string }[]>();
    const procOpcoesVistos = new Map<string, Set<string>>();
    // Serviços vinculados ao médico pela aba "Especialidades" do cadastro do médico.
    // Esta é a fonte principal e preserva a mesma ordem exibida no cadastro do médico.
    for (const r of (mp.data ?? []) as Array<{ medico_id: string | null; procedimento_id: string; created_at?: string | null }>) {
      if (!r.medico_id) continue;
      if (!pm.has(r.medico_id)) pm.set(r.medico_id, new Set());
      pm.get(r.medico_id)!.add(r.procedimento_id);
      const proc = procedimentosPorId.get(r.procedimento_id);
      if (!proc) continue;
      if (!procOpcoesMap.has(r.medico_id)) procOpcoesMap.set(r.medico_id, []);
      if (!procOpcoesVistos.has(r.medico_id)) procOpcoesVistos.set(r.medico_id, new Set());
      const vistos = procOpcoesVistos.get(r.medico_id)!;
      const chave = normalizar(proc.nome);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      procOpcoesMap.get(r.medico_id)!.push(proc);
    }
    setProcPorMedico(pm);
    setProcOpcoesPorMedico(procOpcoesMap);
    const medicosIds = new Set(((m.data ?? []) as Medico[]).map((x) => x.id));
    const nm = new Map<string, Set<string>>();
    for (const r of (mc.data ?? []) as Array<{ medico_id: string; nome: string }>) {
      if (!r.medico_id || !medicosIds.has(r.medico_id)) continue;
      if (!nm.has(r.medico_id)) nm.set(r.medico_id, new Set());
      nm.get(r.medico_id)!.add(normalizar(r.nome));
    }
    setProcNomesPorMedico(nm);

    // Ranking de procedimentos mais usados por médico — últimos 180 dias
    const desde = new Date();
    desde.setDate(desde.getDate() - 180);
    const { data: histRows } = await supabase
      .from("agendamentos")
      .select("medico_id,procedimento")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("inicio", desde.toISOString())
      .not("medico_id", "is", null)
      .not("procedimento", "is", null)
      .limit(20000);
    const rk = new Map<string, Map<string, number>>();
    for (const r of (histRows ?? []) as Array<{ medico_id: string | null; procedimento: string | null }>) {
      if (!r.medico_id || !r.procedimento) continue;
      const k = normalizar(r.procedimento);
      if (!k || k === "disponivel") continue;
      if (!rk.has(r.medico_id)) rk.set(r.medico_id, new Map());
      const mm = rk.get(r.medico_id)!;
      mm.set(k, (mm.get(k) ?? 0) + 1);
    }
    setRankingPorMedico(rk);
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

  // Opções de procedimento disponíveis para um médico específico (cadastro do médico)
  const opcoesProcedimentoMedico = (medicoId: string | null) => {
    if (!medicoId) return [] as { id: string; nome: string }[];
    const opcoesCadastradas = procOpcoesPorMedico.get(medicoId);
    if (opcoesCadastradas && opcoesCadastradas.length > 0) return opcoesCadastradas;
    const ids = procPorMedico.get(medicoId);
    const nomes = procNomesPorMedico.get(medicoId);
    const temConfig = (ids && ids.size > 0) || (nomes && nomes.size > 0);
    if (!temConfig) return [];
    const lista = procedimentosList.filter(
      (p) => (ids?.has(p.id) ?? false) || (nomes?.has(normalizar(p.nome)) ?? false),
    );
    // Top 10 mais usados (últimos 180 dias) vêm primeiro, na ordem do ranking;
    // o restante segue em ordem alfabética.
    const ranking = rankingPorMedico.get(medicoId);
    if (!ranking || ranking.size === 0) {
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }
    const score = (n: string) => ranking.get(normalizar(n)) ?? 0;
    const ordenadosPorUso = [...lista].sort((a, b) => score(b.nome) - score(a.nome));
    const topNomes = new Set(
      ordenadosPorUso.filter((p) => score(p.nome) > 0).slice(0, 10).map((p) => normalizar(p.nome)),
    );
    const top = lista
      .filter((p) => topNomes.has(normalizar(p.nome)))
      .sort((a, b) => score(b.nome) - score(a.nome));
    const resto = lista
      .filter((p) => !topNomes.has(normalizar(p.nome)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return [...top, ...resto];
  };

  // Atualiza inline o procedimento de um agendamento (do badge na coluna Serviço)
  const atualizarProcedimento = async (ag: Agendamento, novoNome: string) => {
    const nomeFinal = novoNome.trim();
    if (!nomeFinal || nomeFinal === (ag.procedimento ?? "")) return;
    const anterior = ag.procedimento;
    setItems((prev) => prev.map((x) => (x.id === ag.id ? { ...x, procedimento: nomeFinal } : x)));
    const { error } = await supabase
      .from("agendamentos")
      .update({ procedimento: nomeFinal })
      .eq("id", ag.id);
    if (error) {
      setItems((prev) => prev.map((x) => (x.id === ag.id ? { ...x, procedimento: anterior } : x)));
      toast.error("Não foi possível atualizar o procedimento");
      return;
    }
    toast.success(`Serviço alterado para ${nomeFinal}`);
  };

  const fichaPorId = useMemo(() => {
    const m = new Map<string, string>();
    // Numeração sequencial por dia e por médico (reinicia a cada data/médico)
    // na ordem do horário. Assim cada agenda do médico fica 001, 002, 003...
    const contadores = new Map<string, number>();
    const ordenados = [...items].sort((a, b) => a.inicio.localeCompare(b.inicio));
    ordenados.forEach((a) => {
      const dia = a.inicio.slice(0, 10);
      const chave = `${dia}__${a.medico_id ?? "sem-medico"}`;
      const n = (contadores.get(chave) ?? 0) + 1;
      contadores.set(chave, n);
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
      } else if (filtroStatus === "agendado") {
        if (ehLivre) return false;
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
  const filtradosOrdenados = useMemo(
    () => [...filtrados].sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [filtrados]
  );
  const paginados = filtradosOrdenados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    // Verificação fresca: bloqueia se algum item já tiver lançamento no banco
    const { data: jaPagosLote } = await supabase
      .from("fin_lancamentos")
      .select("agendamento_id")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("tipo", "receita")
      .in("agendamento_id", ids);
    if ((jaPagosLote ?? []).length > 0) {
      const pagos = new Set(((jaPagosLote ?? []) as Array<{ agendamento_id: string | null }>)
        .map((r) => r.agendamento_id).filter((x): x is string => !!x));
      setPagosSet((prev) => { const n = new Set(prev); pagos.forEach((id) => n.add(id)); return n; });
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
    const desc = `${paciente} — ${itens.map(i => (i.procedimento ?? "CONSULTA")).join(" + ")} (${itens.length} serviços)`;
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

  const isManager = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";

  const excluirSelecionados = async () => {
    if (!clinicaAtual) return;
    if (!isManager) { toast.error("Você não tem permissão para excluir horários."); return; }
    const ids = Array.from(selecionados);
    const itens = items.filter(a => ids.includes(a.id));
    if (itens.length === 0) { toast.info("Selecione ao menos um horário."); return; }
    const bloqueados = itens.filter(i => pagosSet.has(i.id) || (i.paciente_nome !== "DISPONÍVEL" && i.status !== "agendado"));
    if (bloqueados.length > 0) {
      toast.error(`${bloqueados.length} agendamento(s) não podem ser excluídos (já pagos ou em atendimento). Desmarque-os.`);
      return;
    }
    if (!confirm(`Excluir ${ids.length} horário(s)? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("agendamentos").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} horário(s) excluído(s).`);
    setSelecionados(new Set());
    await load();
  };

  // === Reagendamento em lote: move vários agendamentos para outra agenda já aberta ===
  const abrirReagLote = () => {
    if (!clinicaAtual) return;
    if (!isManager) { toast.error("Apenas gestores podem reagendar em lote."); return; }
    const ids = Array.from(selecionados);
    const itens = items.filter(a => ids.includes(a.id));
    if (itens.length === 0) { toast.info("Selecione ao menos um paciente para reagendar."); return; }
    // Ignora silenciosamente fichas vazias; bloqueia apenas pacientes já atendidos
    const atendidos = itens.filter(i => i.status === "realizado");
    if (atendidos.length > 0) {
      toast.error(`${atendidos.length} paciente(s) já atendido(s) não podem ser reagendados. Desmarque-os.`);
      return;
    }
    const validos = itens.filter(i => normalizar(i.paciente_nome) !== "disponivel");
    if (validos.length === 0) {
      toast.info("Nenhum paciente válido para reagendar (todas as fichas selecionadas estão vazias).");
      return;
    }
    // Mesmo fluxo do reagendamento individual: ativa modo lote e aguarda o clique num slot DISPONÍVEL
    const idsOrdenados = validos
      .slice()
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .map(i => i.id);
    setReagendandoAg(null);
    setReagLoteIds(idsOrdenados);
    toast.info(`Selecione um horário disponível na agenda para reagendar os ${idsOrdenados.length} paciente(s) selecionado(s).`);
  };

  const cancelarReagLote = () => setReagLoteIds(null);

  // Confirma o reagendamento em lote ao clicar num slot DISPONÍVEL (a partir desse slot, ocupa os próximos N livres)
  const confirmarReagLoteNoSlot = async (slot: Agendamento) => {
    if (!clinicaAtual) return;
    const ids = reagLoteIds ?? [];
    if (ids.length === 0 || reagLoteSalvando) return;
    if (!slot.medico_id) { toast.error("Slot sem médico definido."); return; }
    if (normalizar(slot.paciente_nome) !== "disponivel") {
      toast.error("Esse horário não está disponível. Escolha um slot DISPONÍVEL.");
      return;
    }
    // Busca os agendamentos de origem direto no banco (os IDs podem não estar em `items`
    // se o usuário trocou os filtros da tela depois de selecionar).
    const { data: fontesRaw, error: eFontes } = await supabase
      .from("agendamentos")
      .select("id,paciente_id,paciente_nome,inicio,fim,medico_id,status,procedimento,observacoes,data_pagamento")
      .in("id", ids)
      .limit(1000);
    if (eFontes) { toast.error(eFontes.message); return; }
    const fontes = ((fontesRaw ?? []) as Array<Agendamento>)
      .filter(a => a.status !== "realizado" && normalizar(a.paciente_nome) !== "disponivel")
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
    if (fontes.length === 0) { toast.error("Nenhum paciente selecionado."); return; }

    // Carrega a agenda de destino (mesmo médico/dia do slot clicado)
    const dataAlvo = new Date(slot.inicio);
    const di = new Date(dataAlvo); di.setHours(0, 0, 0, 0);
    const df = new Date(dataAlvo); df.setHours(23, 59, 59, 999);
    const { data: destinoRaw, error: eDest } = await supabase
      .from("agendamentos")
      .select("id,paciente_id,paciente_nome,inicio,fim,medico_id,status")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("medico_id", slot.medico_id)
      .gte("inicio", di.toISOString())
      .lte("inicio", df.toISOString())
      .order("inicio", { ascending: true })
      .limit(1000);
    if (eDest) { toast.error(eDest.message); return; }
    const destino = (destinoRaw ?? []) as Array<{
      id: string; paciente_id: string | null; paciente_nome: string;
      inicio: string; fim: string; medico_id: string | null; status: string;
    }>;
    const fichaInicial = destino.findIndex(s => s.id === slot.id) + 1;
    if (fichaInicial <= 0) { toast.error("Não foi possível localizar a ficha do slot escolhido."); return; }

    // Slots disponíveis a partir da ficha inicial, excluindo as próprias fontes
    const idsFonte = new Set(fontes.map(f => f.id));
    const candidatos = destino
      .slice(fichaInicial - 1)
      .filter(s => !idsFonte.has(s.id));
    const livres = candidatos.filter(s => normalizar(s.paciente_nome) === "disponivel");
    if (livres.length < fontes.length) {
      toast.error(
        `Não há horários livres suficientes a partir da ficha ${String(fichaInicial).padStart(3, "0")} `
        + `(precisa de ${fontes.length}, encontrou ${livres.length}).`,
      );
      return;
    }
    const alvos = livres.slice(0, fontes.length);

    setReagLoteSalvando(true);
    const agora = new Date().toLocaleString("pt-BR");
    let okCount = 0;
    for (let i = 0; i < fontes.length; i++) {
      const origem = fontes[i];
      const alvo = alvos[i];
      const trilha = `[Reagendado em lote em ${agora}] de ${new Date(origem.inicio).toLocaleString("pt-BR")} para ${new Date(alvo.inicio).toLocaleString("pt-BR")}`;
      const novasObs = origem.observacoes ? `${origem.observacoes}\n${trilha}` : trilha;
      // 1) Libera a ficha de origem
      const { error: e1 } = await supabase.from("agendamentos").update({
        paciente_id: null,
        paciente_nome: "DISPONÍVEL",
        status: "agendado",
        procedimento: null,
        observacoes: null,
        data_pagamento: null,
      } as never).eq("id", origem.id);
      if (e1) { toast.error(`Falha em ${origem.paciente_nome}: ${e1.message}`); continue; }
      // 2) Coloca a paciente na ficha de destino (mantendo o horário do alvo)
      const { error: e2 } = await supabase.from("agendamentos").update({
        paciente_id: origem.paciente_id ?? null,
        paciente_nome: origem.paciente_nome,
        procedimento: origem.procedimento ?? null,
        status: "agendado",
        observacoes: novasObs,
        data_pagamento: origem.data_pagamento ?? null,
      } as never).eq("id", alvo.id);
      if (e2) { toast.error(`Falha ao mover para destino: ${e2.message}`); continue; }
      // 3) Transfere lançamentos financeiros (pagamento) da ficha de origem para a de destino
      await supabase.from("fin_lancamentos")
        .update({ agendamento_id: alvo.id } as never)
        .eq("agendamento_id", origem.id);
      okCount++;
    }
    setReagLoteSalvando(false);
    setReagLoteIds(null);
    setSelecionados(new Set());
    toast.success(`${okCount} paciente(s) reagendado(s) a partir da ficha ${String(fichaInicial).padStart(3, "0")}.`);
    await load();
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
    if (reagendandoAg) { void confirmarReagendamentoNoSlot(a); return; }
    if (reagLoteIds) { void confirmarReagLoteNoSlot(a); return; }
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
    if (reagendandoAg) { toast.error("Esse horário já está ocupado. Escolha um slot disponível."); return; }
    if (reagLoteIds) { toast.error("Esse horário já está ocupado. Escolha um slot DISPONÍVEL."); return; }
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
    if (editing && pagosSet.has(editing.id)) {
      toast.error("Agendamento já pago — somente visualização.");
      return;
    }
    if (!form.paciente_nome.trim()) { toast.error("Informe o paciente"); return; }
    if (!form.paciente_id) {
      toast.error("Selecione um paciente cadastrado na lista ou clique em \"Cadastrar agora\" para criar o cadastro antes de salvar.");
      return;
    }
    if (!form.inicio || !form.fim) { toast.error("Defina início e fim"); return; }
    if (new Date(form.fim) <= new Date(form.inicio)) { toast.error("O horário final deve ser após o inicial"); return; }
    if (!form.procedimento.trim()) { toast.error("Selecione o serviço"); return; }
    // Bloqueia criação/movimentação para um médico sem agenda aberta naquele dia
    const mudouHorarioOuMedico = !editing
      || editing.medico_id !== form.medico_id
      || new Date(editing.inicio).getTime() !== new Date(form.inicio).getTime()
      || new Date(editing.fim).getTime() !== new Date(form.fim).getTime();
    if (form.medico_id && mudouHorarioOuMedico) {
      const di = new Date(form.inicio);
      const df = new Date(form.fim);
      const inicioDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 0, 0, 0).toISOString();
      const fimDia = new Date(di.getFullYear(), di.getMonth(), di.getDate(), 23, 59, 59).toISOString();
      const q = supabase
        .from("agendamentos")
        .select("id,paciente_nome,inicio,fim", { count: "exact", head: false })
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("medico_id", form.medico_id)
        .gte("inicio", inicioDia)
        .lte("inicio", fimDia)
        .limit(500);
      const { data: slotsDia } = await q;
      const lista = (slotsDia ?? []) as { id: string; paciente_nome: string; inicio: string; fim: string }[];
      const excluindoEditing = editing ? lista.filter((x) => x.id !== editing.id) : lista;
      if (excluindoEditing.length === 0) {
        toast.error("Este médico não tem agenda aberta nessa data. Gere os horários em Disponibilidades antes de agendar.");
        return;
      }
      // Precisa existir um slot livre que cubra o horário escolhido (ou conflito com o próprio agendamento em edição)
      const inicioMs = di.getTime();
      const fimMs = df.getTime();
      const cobre = excluindoEditing.some((s) => {
        if (normalizar(s.paciente_nome) !== "disponivel") return false;
        const sIni = new Date(s.inicio).getTime();
        const sFim = new Date(s.fim).getTime();
        return sIni <= inicioMs && sFim >= fimMs;
      });
      if (!cobre) {
        toast.error("Não há horário livre desse médico cobrindo o intervalo escolhido. Escolha um slot DISPONÍVEL na agenda ou gere mais horários em Disponibilidades.");
        return;
      }
    }
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
      let opcoes: FormaOpcao[] = [
        { forma: "dinheiro", label: "Dinheiro", valor: vDinheiro },
        { forma: "pix", label: "Pix", valor: vPix },
        { forma: "cartao_debito", label: "Cartão de Débito", valor: vDebito },
        { forma: "cartao_credito", label: "Cartão de Crédito", valor: vCredito },
      ];
      let descSuffix = "";
      const info = await obterInfoConvenioPaciente({
        clinicaId: clinicaAtual.clinica_id,
        pacienteId: payload.paciente_id,
        medicoId: payload.medico_id,
        procedimentoNome: payload.procedimento ?? "",
      });
      if (info) {
        if (!info.emDia) {
          toast.error(`Convênio ${info.convenioNome} em atraso (${info.parcelasAtrasadas} parcela(s)). Cobrando valor cheio.`);
          descSuffix = ` — ${info.convenioNome} EM ATRASO`;
        } else if (info.desconto) {
          opcoes = opcoes.map((o) => ({ ...o, valor: aplicarDesconto(o.valor, info.desconto!) }));
          const rotulo =
            info.desconto.tipo === "gratuidade"
              ? "GRATUIDADE"
              : info.desconto.tipo === "percentual"
                ? `-${info.desconto.valor}%`
                : `-R$ ${Number(info.desconto.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          descSuffix = ` — Convênio ${info.convenioNome} (${rotulo})`;
          toast.success(`Desconto do convênio ${info.convenioNome} aplicado (${rotulo}).`);
        } else {
          toast.info(`Cliente possui convênio ${info.convenioNome}, mas sem benefício para este procedimento.`);
        }
      }
      setFormaPagOpcoes(opcoes);
      setFormaPagCtx({ agId: novoId, desc: `${payload.paciente_nome} — ${payload.procedimento ?? "CONSULTA"}${descSuffix}` });
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
    // Verificação fresca no banco: impede faturar duas vezes mesmo se o cache
    // local estiver desatualizado (ex.: outro usuário pagou em outra aba, ou
    // o pagamento foi transferido de uma ficha reagendada).
    const { data: jaPagos } = await supabase
      .from("fin_lancamentos")
      .select("id")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("tipo", "receita")
      .eq("agendamento_id", a.id)
      .limit(1);
    if ((jaPagos ?? []).length > 0) {
      toast.info("Este agendamento já foi pago.");
      setPagosSet((prev) => { const n = new Set(prev); n.add(a.id); return n; });
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
    let opcoes: FormaOpcao[] = [
      { forma: "dinheiro", label: "Dinheiro", valor: vDinheiro },
      { forma: "pix", label: "Pix", valor: vPix },
      { forma: "cartao_debito", label: "Cartão de Débito", valor: vDebito },
      { forma: "cartao_credito", label: "Cartão de Crédito", valor: vCredito },
    ];
    let descSuffix = "";
    const info = await obterInfoConvenioPaciente({
      clinicaId: clinicaAtual.clinica_id,
      pacienteId: a.paciente_id,
      medicoId: a.medico_id,
      procedimentoNome: a.procedimento ?? "",
    });
    if (info) {
      if (!info.emDia) {
        toast.error(`Convênio ${info.convenioNome} em atraso (${info.parcelasAtrasadas} parcela(s)). Cobrando valor cheio.`);
        descSuffix = ` — ${info.convenioNome} EM ATRASO`;
      } else if (info.desconto) {
        opcoes = opcoes.map((o) => ({ ...o, valor: aplicarDesconto(o.valor, info.desconto!) }));
        const rotulo =
          info.desconto.tipo === "gratuidade"
            ? "GRATUIDADE"
            : info.desconto.tipo === "percentual"
              ? `-${info.desconto.valor}%`
              : `-R$ ${Number(info.desconto.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        descSuffix = ` — Convênio ${info.convenioNome} (${rotulo})`;
        toast.success(`Desconto do convênio ${info.convenioNome} aplicado (${rotulo}).`);
      } else {
        toast.info(`Cliente possui convênio ${info.convenioNome}, mas sem benefício para este procedimento.`);
      }
    }
    setFormaPagOpcoes(opcoes);
    setFormaPagCtx({ agId: a.id, desc: `${a.paciente_nome} — ${a.procedimento ?? "CONSULTA"}${descSuffix}` });
    setFormaPagOpen(true);
  };

  const confirmarPresenca = async (a: Agendamento) => {
    const { error } = await supabase
      .from("agendamentos")
      .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Presença confirmada — paciente liberado para a triagem");
    setEtapaMap((m) => { const n = new Map(m); n.set(a.id, "triagem"); return n; });
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

  // Atalhos de teclado no diálogo "Forma de pagamento":
  // 1=Dinheiro, 2=PIX, 3=Débito, 4=Crédito, 5=Mais de uma forma
  // (segue a ordem exibida em formaPagOpcoes; tecla 5 = misto).
  useEffect(() => {
    if (!formaPagOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        if (idx < formaPagOpcoes.length) {
          e.preventDefault();
          escolherForma(formaPagOpcoes[idx]);
        } else if (idx === formaPagOpcoes.length) {
          e.preventDefault();
          escolherMisto();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formaPagOpen, formaPagOpcoes, formaPagCtx]);

  // Atalhos da tela Agenda:
  // N = novo encaixe, F = focar filtro de profissional, R = recarregar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt) {
        const tag = tgt.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable) return;
        if (tgt.closest('[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]')) return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        openNew();
      } else if (k === "f") {
        const el = document.querySelector<HTMLElement>("[data-agenda-filtro-prof]");
        if (el) { e.preventDefault(); el.focus(); }
      } else if (k === "r") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const prefixoMedico = (sexo?: string | null) => {
    const s = (sexo ?? "").toString().trim().toUpperCase();
    if (s.startsWith("F")) return "Dra.";
    if (s.startsWith("M")) return "Dr.";
    return "Dr(a).";
  };
  const medicoNome = (id: string | null) => {
    const m = medicos.find(x => x.id === id);
    if (!m) return "—";
    return `${prefixoMedico(m.sexo)} ${m.nome}`;
  };
  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtData = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
  };
  const fmtDiaSemana = (iso: string) => DIAS_SEMANA[new Date(iso).getDay()];

  return (
    <div className="space-y-3">
      {reagendandoAg && (
        <div className="sticky top-0 z-30 -mx-4 px-4 py-2 border-b bg-primary text-primary-foreground shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold uppercase">Reagendando · {reagendandoAg.paciente_nome}</span>
              <span className="ml-2 opacity-90">
                Atual: {new Date(reagendandoAg.inicio).toLocaleString("pt-BR")}
                {reagendandoAg.procedimento ? ` — ${reagendandoAg.procedimento}` : ""}
              </span>
              <span className="ml-2 opacity-90 italic">Clique em um horário disponível na agenda para confirmar.</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={cancelarReagendamento}
              disabled={reagSalvando}
            >
              {reagSalvando ? "Salvando…" : "Cancelar reagendamento"}
            </Button>
          </div>
        </div>
      )}
      {reagLoteIds && reagLoteIds.length > 0 && (
        <div className="sticky top-0 z-30 -mx-4 px-4 py-2 border-b bg-primary text-primary-foreground shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold uppercase">Reagendando · {reagLoteIds.length} paciente(s) selecionado(s)</span>
              <span className="ml-2 opacity-90 italic">
                Clique em um horário DISPONÍVEL na agenda. Os pacientes serão alocados em sequência a partir dessa ficha.
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={cancelarReagLote}
              disabled={reagLoteSalvando}
            >
              {reagLoteSalvando ? "Salvando…" : "Cancelar reagendamento"}
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Agendas
          </h1>
          <p className="text-sm text-muted-foreground">Filtre e gerencie os agendamentos da clínica.</p>
        </div>
        <div className="flex gap-1.5">
          <div className="inline-flex rounded-full border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("dia")}
              className={`px-2 py-1 text-[11px] font-medium rounded-full transition-colors ${viewMode === "dia" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("medico")}
              className={`px-2 py-1 text-[11px] font-medium rounded-full transition-colors ${viewMode === "medico" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Por médico
            </button>
          </div>
          <Button asChild variant="outline" size="sm" className="h-7 text-[11px] px-2" title="Cadastrar horários semanais e gerar slots da agenda">
            <Link to="/app/disponibilidades">
              <Clock className="h-3 w-3 mr-1.5" /> Criar/gerar horários
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" disabled={selecionados.size === 0}>
                Opções ({selecionados.size})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={cobrarSelecionados}>
                💳 Cobrar selecionados (1 pagamento)
              </DropdownMenuItem>
              {isManager && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={abrirReagLote}>
                    🔁 Reagendar selecionados
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={excluirSelecionados}
                    className="text-destructive focus:text-destructive"
                  >
                    🗑️ Excluir horários selecionados
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] px-2"
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
                  { key: "procedimento", label: "Serviço" },
                  { key: "status", label: "Status" },
                  { key: "observacoes", label: "Observações" },
                ],
              );
            }}
          >
            <Download className="h-3 w-3 mr-1.5" /> Exportar Excel
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew} disabled={!clinicaAtual} className="h-7 text-[11px] px-2 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="h-3 w-3 mr-1.5" /> Adicionar Encaixe
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? (pagosSet.has(editing.id) ? "Visualizar agendamento (pago)" : "Editar agendamento")
                  : "Novo agendamento"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              {editing && pagosSet.has(editing.id) && (
                <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
                  Este agendamento já foi pago. Para alterações, estorne o pagamento no Financeiro.
                </div>
              )}
              <fieldset
                disabled={editing ? pagosSet.has(editing.id) : false}
                className="space-y-3 contents disabled:opacity-90"
              >
              <div className="space-y-1">
                <Label>Paciente</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <PatientSearchInput
                      value={form.paciente_id ? { id: form.paciente_id, nome: form.paciente_nome, cpf: null, telefone: null, data_nascimento: null, clinica_id: "" } : null}
                      onSelect={(p) => {
                        setForm(f => ({
                          ...f,
                          paciente_nome: p?.nome ?? "",
                          paciente_id: p?.id ?? "",
                        }));
                      }}
                      placeholder="Buscar por nome ou CPF…"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" title="Cadastrar novo paciente"
                    disabled={editing ? pagosSet.has(editing.id) : false}
                    onClick={() => { setNovoPac(p => ({ ...p, nome: form.paciente_nome })); setNovoPacOpen(true); }}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
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
                      type="text"
                      value={form.data_pagamento
                        ? new Date(form.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                      readOnly
                      disabled
                      tabIndex={-1}
                      className="bg-muted/40 cursor-not-allowed"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Preenchida automaticamente pelo sistema quando o pagamento for registrado.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Serviço</Label>
                {form.medico_id ? (
                  (procOpcoesPorMedico.get(form.medico_id)?.length || procPorMedico.get(form.medico_id)?.size || procNomesPorMedico.get(form.medico_id)?.size) ? (
                    <p className="text-xs text-muted-foreground">Mostrando apenas serviços configurados para este médico.</p>
                  ) : (
                    <p className="text-xs text-amber-600">
                      Este médico não possui serviços cadastrados. Configure-os no cadastro do médico.
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Selecione um médico para ver os serviços disponíveis.</p>
                )}
                <SearchableSelect
                  value={form.procedimento || "none"}
                  onChange={(v) => setForm(f => ({ ...f, procedimento: v === "none" ? "" : v }))}
                  placeholder="Selecione o serviço"
                  searchPlaceholder="Buscar serviço..."
                  options={[
                    { value: "none", label: "— Selecione —" },
                    ...(form.medico_id
                      ? opcoesProcedimentoMedico(form.medico_id).map((p) => ({ value: p.nome, label: p.nome }))
                      : []),
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
              </fieldset>
              <DialogFooter>
                {editing && pagosSet.has(editing.id) ? (
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
                ) : (
                  <>
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
                    <Button type="submit" data-primary disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
                  </>
                )}
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
          <p className="text-sm text-muted-foreground -mt-2">
            {formaPagCtx?.desc}
            <span className="block text-xs mt-1 opacity-70">Dica: use as teclas 1–5 para escolher rapidamente.</span>
          </p>
          <div className="grid gap-2 mt-2">
            {formaPagOpcoes.map((op, idx) => (
              <Button
                key={op.forma}
                variant="outline"
                className="justify-between h-12"
                onClick={() => escolherForma(op)}
              >
                <span className="flex items-center gap-2">
                  <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border bg-muted text-xs font-mono">{idx + 1}</kbd>
                  {op.label}
                </span>
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
              <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border border-primary-foreground/40 bg-primary-foreground/10 text-xs font-mono mr-2">{formaPagOpcoes.length + 1}</kbd>
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
            await printGuiaAtendimentoAgrupada({
              agendamentoIds: [pagamentoAgId, ...pagamentoExtraIds],
              clinicaId: clinicaAtual.clinica_id,
              usuarioNome: user?.user_metadata?.nome ?? user?.email ?? undefined,
              usuarioId: user?.id ?? null,
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
                  const isLanc = r.table_name === "fin_lancamentos";
                  const repasseLabel: Record<string, string> = {
                    repasse_pago: "Repasse ao médico",
                    repasse_pago_em: "Data do repasse",
                    repasse_forma_pagamento: "Forma do repasse",
                  };
                  const allowedLanc = new Set(Object.keys(repasseLabel));
                  const fmtVal = (k: string, v: unknown) => {
                    if (k === "repasse_pago") return v ? "Pago" : "Pendente";
                    if (k === "repasse_pago_em" && typeof v === "string" && v) {
                      return new Date(v + "T00:00:00").toLocaleDateString("pt-BR");
                    }
                    return v == null || v === "" ? "—" : String(v);
                  };
                  const chaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)]))
                    .filter((k) => !["updated_at", "created_at", "fluxo_atualizado_em"].includes(k))
                    .filter((k) => (isLanc ? allowedLanc.has(k) : true))
                    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
                  const quem = (r.user_email && nomePorEmail.get(r.user_email)) || r.user_email || "—";
                  // Para lançamentos: ignorar entradas que não envolvem campos de repasse
                  if (isLanc && r.action === "UPDATE" && chaves.length === 0) return null;
                  return (
                    <div key={r.id} className="rounded-md border p-3 bg-card">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={acaoCor[r.action] ?? ""}>{acaoLabel[r.action] ?? r.action}</Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            {isLanc ? "pagamento" : r.table_name}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("pt-BR")} · {quem}
                        </div>
                      </div>
                      {r.action === "UPDATE" && chaves.length > 0 && (
                        <div className="text-xs space-y-1">
                          {chaves.map((k) => (
                            <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                              <span className="font-medium text-muted-foreground">
                                {isLanc ? (repasseLabel[k] ?? k) : k}:
                              </span>
                              <span>
                                <span className="line-through text-rose-600">{fmtVal(k, antes[k])}</span>
                                {" → "}
                                <span className="text-emerald-700">{fmtVal(k, depois[k])}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.action === "INSERT" && (
                        <p className="text-xs text-muted-foreground">
                          {isLanc
                            ? `Pagamento da consulta registrado${depois.repasse_pago ? " — repasse já pago" : " — repasse pendente"}.`
                            : "Registro criado."}
                        </p>
                      )}
                      {r.action === "DELETE" && (
                        <p className="text-xs text-muted-foreground">
                          {isLanc ? "Pagamento removido." : "Registro excluído."}
                        </p>
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
        className="rounded-lg border bg-card p-2 space-y-1.5 text-xs [&_input]:h-7 [&_input]:text-xs [&_button[role=combobox]]:h-7 [&_button[role=combobox]]:text-xs [--clinic:theme(colors.border)]"
        style={{ ["--clinic" as never]: corClinica }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1.5">
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Profissional</Label>
            <MedicoFiltroInput
              medicos={medicos}
              value={filtroMedico}
              onChange={(v) => { if (!isMedicoOnly) setFiltroMedico(v); }}
              disabled={isMedicoOnly}
              onlyMedicoId={isMedicoOnly ? medicoLogadoId : null}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Data Ref.</Label>
            <DataRefField
              dataRef={dataRef}
              dataFim={dataFim}
              setDataRef={setDataRef}
              setDataFim={setDataFim}
              shiftData={shiftData}
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Dia Semana</Label>
            <Select value={filtroDiaSemana} onValueChange={setFiltroDiaSemana}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {DIAS_SEMANA.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cliente</Label>
            <div className="flex gap-1">
              <Input data-quick-search value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Buscar paciente…" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Cadastrar paciente rápido"
                onClick={() => {
                  setNovoPac({ nome: filtroCliente.trim(), cpf: "", telefone: "", data_nascimento: "", email: "" });
                  setNovoPacOpen(true);
                }}
                className="h-7 w-7"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Nº Ficha</Label>
            <Input value={filtroFicha} onChange={(e) => setFiltroFicha(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 001" inputMode="numeric" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Especialidade</Label>
            <Select value={filtroEspecialidade} onValueChange={setFiltroEspecialidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">TODOS</SelectItem>
                {especialidades.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Situação</Label>
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
          <div className="flex items-end gap-1.5">
            <Button variant="outline" size="sm" onClick={limparFiltros} className="h-7 text-xs flex-1"><X className="h-3.5 w-3.5 mr-1.5" /> Limpar</Button>
            <Button size="sm" onClick={load} className="h-7 text-xs flex-1"><Search className="h-3.5 w-3.5 mr-1.5" /> Exibir</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={apenasData} onCheckedChange={(v) => setApenasData(!!v)} />
              Exibir apenas a data selecionada
            </label>
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
              <TableHead className="w-24">Intervalo</TableHead>
              <TableHead className="w-[220px] max-w-[220px]">Profissional</TableHead>
              <TableHead className="w-[220px] max-w-[220px]">Cliente</TableHead>
              <TableHead className="w-40">Serviço</TableHead>
              <TableHead className="w-28 text-center">Alertas</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
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
                <TableRow key={a.id} className={realizado ? "bg-emerald-50 dark:bg-emerald-950/20 [&>td]:py-1 [&>td]:h-9 text-xs" : "[&>td]:py-1 [&>td]:h-9 text-xs"}>
                  <TableCell title="Marque para cobrar este atendimento em um pagamento agrupado">
                    <Checkbox checked={selecionados.has(a.id)} onCheckedChange={() => toggleSel(a.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{fichaNum}</TableCell>
                  <TableCell className="text-sm">{fmtDiaSemana(a.inicio)}</TableCell>
                  <TableCell className="text-sm">{fmtData(a.inicio)}</TableCell>
                  <TableCell>
                     <span className="text-emerald-600 font-medium">{fmtHora(a.inicio)} - {fmtHora(a.fim)}</span>
                  </TableCell>
                  <TableCell className="pr-1 align-middle max-w-[220px]">
                    {(() => {
                      const m = medicos.find((x) => x.id === a.medico_id);
                      const label = m ? `${prefixoMedico(m.sexo)} ${m.nome}` : "—";
                      return (
                        <div
                          className="text-xs uppercase font-medium text-foreground truncate"
                          title={label}
                        >
                          {label}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="pr-1 align-middle max-w-[220px]">
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
                        className="inline-flex items-center gap-1 text-xs uppercase font-medium text-foreground hover:text-primary hover:underline max-w-full overflow-hidden"
                      >
                        {a.status === "confirmado" && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        {a.paciente_id && <IdadeIcon nascimento={nascMap.get(a.paciente_id) ?? null} size={18} />}
                        {a.paciente_id && convenioMap.has(a.paciente_id) && (
                          <span
                            title={`Convênio: ${convenioMap.get(a.paciente_id)}`}
                            className="inline-flex items-center justify-center rounded-[3px] border border-sky-500/50 bg-sky-50 p-0.5 text-sky-700"
                          >
                            <IdCard className="h-3.5 w-3.5" strokeWidth={2} />
                          </span>
                        )}
                        <span className="truncate min-w-0">{a.paciente_nome}</span>
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <ProcedimentoCell
                      valor={a.procedimento}
                      opcoes={opcoesProcedimentoMedico(a.medico_id)}
                      disabled={normalizar(a.paciente_nome) === "disponivel"}
                      onChange={(novo) => atualizarProcedimento(a, novo)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {normalizar(a.paciente_nome) === "disponivel" ? (
                        <Badge className="bg-slate-100 text-slate-600 border border-slate-300">Livre</Badge>
                      ) : (
                        <Badge className={STATUS_COR[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                      )}
                      {/* Badge "Pago" removida — destaque fica apenas no ícone $ na coluna Ações */}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(() => {
                        const etapa = etapaMap.get(a.id) ?? "aguardando_recepcao";
                        const pendenteCheckin = ["aguardando_recepcao","recepcao"].includes(etapa);
                        if (pagosSet.has(a.id) && pendenteCheckin) {
                          return (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Confirmar presença (check-in)"
                              onClick={() => confirmarPresenca(a)}
                              className="h-5 w-5 border rounded-md text-emerald-700 border-emerald-600 hover:bg-emerald-50"
                            >
                              <BadgeCheck className="h-2.5 w-2.5" />
                            </Button>
                          );
                        }
                        if (!pendenteCheckin && normalizar(a.paciente_nome) !== "disponivel") {
                          return (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled
                              title="Check-in já realizado"
                              className="h-5 w-5 border rounded-md bg-emerald-600 text-white border-emerald-600 disabled:opacity-100"
                            >
                              <BadgeCheck className="h-2.5 w-2.5" />
                            </Button>
                          );
                        }
                        return null;
                      })()}
                      <Button
                        variant="ghost"
                        size="icon"
                        title={pagosSet.has(a.id) ? "Pago" : "Pagamento pendente"}
                        onClick={() => cobrarAgendamento(a)}
                        className={`h-7 w-7 border-2 rounded-md shadow-sm ${pagosSet.has(a.id)
                          ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 hover:text-white ring-2 ring-emerald-200"
                          : "text-rose-600 border-rose-600 hover:text-rose-700 hover:bg-rose-50"}`}
                      >
                        <DollarSign className="h-4 w-4" strokeWidth={pagosSet.has(a.id) ? 3 : 2.5} />
                      </Button>
                      <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => iniciarReagendamento(a)}
                          disabled={a.status === "realizado"}
                        >
                          <CalendarDays className="h-4 w-4 mr-2" /> Reagendar
                        </DropdownMenuItem>
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
                    </div>
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
                    <div className="text-xs text-muted-foreground">Serviço nº {pacInfo.numero_pasta}</div>
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
                  <Button
                    size="sm"
                    onClick={() => { window.location.href = `/app/clientes/${pacInfo.id}/editar`; }}
                  >
                    Editar
                  </Button>
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
          data-agenda-filtro-prof
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
