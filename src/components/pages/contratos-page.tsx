import { useEffect, useMemo, useState } from "react";
import {
  FileSignature,
  Plus,
  Printer,
  Search,
  Trash2,
  Link2,
  Check,
  ChevronRight,
  CreditCard,
  Camera,
  ArrowLeft,
  Ban,
  XCircle,
  RefreshCw,
  Pencil,
  Mail,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import DOMPurify from "dompurify";
import { ChevronsUpDown } from "lucide-react";
import { printContrato } from "@/lib/print-contrato";
import { fmtDataExtenso } from "@/lib/print-contrato";
import { printCartoes } from "@/lib/print-cartao";
import { printGuiaMensalidade, printGuiaMensalidadeComTaxa } from "@/lib/print-gr";
import { gerarCarnePDF } from "@/lib/print-carne";
import { gerarBoletosContrato } from "@/lib/boleto.functions";
import { useServerFn } from "@tanstack/react-start";
import { Barcode, FileText } from "lucide-react";
import { FaceCaptureDialog } from "@/components/face/FaceCaptureDialog";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { EditarPacienteRapidoDialog } from "@/components/contratos/editar-paciente-rapido-dialog";
import { QuickPatientDialog } from "@/components/pacientes/quick-patient-dialog";

const BRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtD = (s?: string | null) =>
  s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
// Adiciona 1 ano à data inicial (formato ISO YYYY-MM-DD). Retorna null se inválida.
const addUmAno = (s?: string | null): string | null => {
  if (!s) return null;
  const iso = s.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y + 1, m - 1, d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const TAXA_BOLETO = 3.5;

// Parcela só é "Atrasado" a partir do dia seguinte ao vencimento (comparação em data local).
const isAtrasado = (vencimento?: string | null) => {
  if (!vencimento) return false;
  const [y, m, d] = vencimento.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return false;
  const venc = new Date(y, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje.getTime() > venc.getTime();
};

type Convenio = {
  id: string;
  nome: string;
  descricao: string | null;
  valor_mensal: number;
  taxa_adesao: number;
  num_parcelas: number;
  max_dependentes: number;
  vigencia_meses: number;
  beneficios: string | null;
};
type Faixa = { id: string; convenio_id: string; vidas_de: number; vidas_ate: number | null; valor_mensal: number };
type Paciente = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  face_descriptor?: number[] | null;
};
type Contrato = {
  id: string;
  numero: number;
  paciente_nome: string;
  convenio_id: string | null;
  plano_id: string | null;
  valor_mensal: number;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  assinado_em: string | null;
  token_publico: string;
  forma_pagamento: string | null;
  dia_vencimento?: number | null;
  taxa_adesao?: number | null;
  num_parcelas?: number | null;
  paciente_id?: string | null;
  clinica_id?: string | null;
  observacoes?: string | null;
  cancelado_em?: string | null;
  cancelamento_motivo?: string | null;
  tabela_legada?: boolean | null;
  migrar_apos?: string | null;
  criado_por?: string | null;
};
type Mens = {
  id: string;
  numero_parcela: number;
  vencimento: string;
  valor: number;
  status: string;
  pago_em: string | null;
  forma_pagamento: string | null;
  taxa_adesao?: number | null;
};

const isAdesao = (m: Pick<Mens, "numero_parcela">) => Number(m.numero_parcela) === 0;

const cobrancaLabel = (m: Pick<Mens, "numero_parcela">) =>
  isAdesao(m) ? "Adesão" : `Mensalidade ${m.numero_parcela}`;
type Dep = {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string;
  cpf?: string | null;
  incluido_em: string | null;
  excluido_em: string | null;
  ativo: boolean;
};

export function ContratosPage({ initialContratoId, modulo = "contratos" }: { initialContratoId?: string; modulo?: string } = {}) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  // Esta tela é reaproveitada em duas rotas com módulos de permissão
  // diferentes: /app/contratos (módulo "contratos") e
  // /app/cartao-beneficios/contratos (módulo "cartao-beneficios") — cada
  // rota informa o módulo certo via prop, propagado aos componentes filhos.
  const podeEscrever = usePodeEscrever(modulo);
  const [list, setList] = useState<Contrato[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  // Map criado_por (uuid) → nome do vendedor. Preenchido em load().
  const [vendedores, setVendedores] = useState<Record<string, string>>({});
  // Agregado de parcelas por contrato (pagas / total / tem atrasada)
  const [parcAgg, setParcAgg] = useState<Record<string, { pagas: number; total: number; temAtrasada: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "new">("list");
  const [detail, setDetail] = useState<Contrato | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<"resumo" | "dados" | "contrato">("resumo");
  const [sortPaciente, setSortPaciente] = useState<null | "asc" | "desc">(null);
  // Filtros
  const [filtroSituacao, setFiltroSituacao] = useState<"todas" | "em_dia" | "pendente">("todas");
  const [filtroTermino, setFiltroTermino] = useState<"todos" | "vencidos" | "30d" | "90d" | "sem_data">("todos");
  const [filtroProgresso, setFiltroProgresso] = useState<"todas" | "sem_pag" | "andamento" | "quitadas">("todas");
  const [filtroInicio, setFiltroInicio] = useState<"todos" | "30d" | "90d" | "ano" | "anterior">("todos");
  const [filtroMensal, setFiltroMensal] = useState<"todos" | "zero" | "ate100" | "100a200" | "acima200">("todos");
  const [filtroVendedor, setFiltroVendedor] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroConvenio, setFiltroConvenio] = useState<string>("todos");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;

  // Termo com debounce para acionar busca server-side sem bater a cada tecla.
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async (termo = "") => {
    if (!clinicaAtual) return;
    setLoading(true);
    let contratosQuery = supabase
      .from("contratos_assinatura")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false });
    const s = termo.trim();
    if (s.length >= 2) {
      // Busca no servidor: por nome do paciente (ilike) e, quando o termo for
      // numérico, também pelo número do contrato. Isso evita perder registros
      // fora dos 500 mais recentes (clínicas com >500 contratos).
      const soDigitos = /^\d+$/.test(s);
      const orExpr = soDigitos
        ? `paciente_nome.ilike.%${s}%,numero.eq.${s}`
        : `paciente_nome.ilike.%${s}%`;
      contratosQuery = contratosQuery.or(orExpr).limit(200);
    } else {
      contratosQuery = contratosQuery.limit(500);
    }
    const [cs, cv] = await Promise.all([
      contratosQuery,
      supabase
        .from("cb_convenios")
        .select("*")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
    ]);
    if (cs.error) mostrarErro(cs.error);
    setList((cs.data ?? []) as Contrato[]);
    setConvenios((cv.data ?? []) as Convenio[]);
    // Agregar parcelas dos contratos carregados
    const contratoIds = ((cs.data ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (contratoIds.length > 0) {
      const { data: mens } = await supabase
        .from("contrato_mensalidades")
        .select("contrato_id, status, vencimento")
        .in("contrato_id", contratoIds);
      const hojeStr = new Date().toISOString().slice(0, 10);
      const agg: Record<string, { pagas: number; total: number; temAtrasada: boolean }> = {};
      for (const id of contratoIds) agg[id] = { pagas: 0, total: 0, temAtrasada: false };
      for (const m of (mens ?? []) as Array<{ contrato_id: string; status: string; vencimento: string }>) {
        const a = agg[m.contrato_id];
        if (!a) continue;
        a.total += 1;
        if (m.status === "pago") a.pagas += 1;
        else if (m.vencimento && m.vencimento < hojeStr) a.temAtrasada = true;
      }
      setParcAgg(agg);
    } else {
      setParcAgg({});
    }
    // Buscar nomes dos usuários que criaram os contratos (vendedores).
    const ids = Array.from(
      new Set(
        ((cs.data ?? []) as Array<{ criado_por: string | null }>)
          .map((r) => r.criado_por)
          .filter((x): x is string => !!x),
      ),
    );
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,nome")
        .in("id", ids);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as Array<{ id: string; nome: string | null }>) {
        if (p.nome) map[p.id] = p.nome;
      }
      setVendedores(map);
    } else {
      setVendedores({});
    }
    setLoading(false);
  };
  useEffect(() => {
    load(qDebounced); /* eslint-disable-next-line */
  }, [clinicaAtual?.clinica_id, qDebounced]);

  // Deep-link: abrir automaticamente um contrato específico (ex.: vindo da aba Convênio no cadastro do cliente)
  useEffect(() => {
    if (!initialContratoId || loading || detail) return;
    const c = list.find((x) => x.id === initialContratoId);
    if (c) setDetail(c);
  }, [initialContratoId, loading, list, detail]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = !s ? list : list.filter((c) => `${c.numero} ${c.paciente_nome}`.toLowerCase().includes(s));
    const hojeStr = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const dHoje = new Date(hojeStr + "T00:00:00").getTime();
    const anoAtual = new Date().getFullYear();
    const withFilters = base.filter((c) => {
      const a = parcAgg[c.id];
      // Início
      if (filtroInicio !== "todos") {
        const ini = c.data_inicio?.slice(0, 10) ?? null;
        if (!ini) return false;
        const dIni = new Date(ini + "T00:00:00").getTime();
        const dias = (dHoje - dIni) / 86400000;
        if (filtroInicio === "30d" && dias > 30) return false;
        if (filtroInicio === "90d" && dias > 90) return false;
        if (filtroInicio === "ano" && new Date(ini + "T00:00:00").getFullYear() !== anoAtual) return false;
        if (filtroInicio === "anterior" && new Date(ini + "T00:00:00").getFullYear() >= anoAtual) return false;
      }
      // Mensal
      if (filtroMensal !== "todos") {
        const v = Number(c.valor_mensal) || 0;
        if (filtroMensal === "zero" && v !== 0) return false;
        if (filtroMensal === "ate100" && !(v > 0 && v <= 100)) return false;
        if (filtroMensal === "100a200" && !(v > 100 && v <= 200)) return false;
        if (filtroMensal === "acima200" && !(v > 200)) return false;
      }
      // Vendedor
      if (filtroVendedor !== "todos") {
        if (filtroVendedor === "sem") {
          if (c.criado_por && vendedores[c.criado_por]) return false;
        } else if (c.criado_por !== filtroVendedor) return false;
      }
      // Status
      if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
      // Convênio
      if (filtroConvenio !== "todos") {
        if (filtroConvenio === "sem") {
          if (c.convenio_id) return false;
        } else if (c.convenio_id !== filtroConvenio) return false;
      }
      // Situação
      if (filtroSituacao !== "todas") {
        const emDia = !a || !a.temAtrasada;
        if (filtroSituacao === "em_dia" && !emDia) return false;
        if (filtroSituacao === "pendente" && emDia) return false;
      }
      // Término
      if (filtroTermino !== "todos") {
        const fim = c.data_fim?.slice(0, 10) ?? null;
        if (filtroTermino === "sem_data" && fim) return false;
        if (filtroTermino === "vencidos" && (!fim || fim >= hojeStr)) return false;
        if (filtroTermino === "30d" && (!fim || fim < hojeStr || fim > in30)) return false;
        if (filtroTermino === "90d" && (!fim || fim < hojeStr || fim > in90)) return false;
      }
      // Progresso
      if (filtroProgresso !== "todas") {
        if (!a) return false;
        if (filtroProgresso === "sem_pag" && a.pagas !== 0) return false;
        if (filtroProgresso === "andamento" && (a.pagas === 0 || a.pagas >= a.total)) return false;
        if (filtroProgresso === "quitadas" && (a.total === 0 || a.pagas < a.total)) return false;
      }
      return true;
    });
    if (!sortPaciente) return withFilters;
    const ordered = [...withFilters].sort((a, b) =>
      a.paciente_nome.localeCompare(b.paciente_nome, "pt-BR", { sensitivity: "base" }),
    );
    return sortPaciente === "asc" ? ordered : ordered.reverse();
  }, [list, q, sortPaciente, parcAgg, vendedores, filtroSituacao, filtroTermino, filtroProgresso, filtroInicio, filtroMensal, filtroVendedor, filtroStatus, filtroConvenio]);

  // Opções dinâmicas
  const vendedorOpcoes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of list) {
      if (c.criado_por && vendedores[c.criado_por] && !seen.has(c.criado_por)) {
        seen.set(c.criado_por, vendedores[c.criado_por]);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [list, vendedores]);
  const statusOpcoes = useMemo(() => {
    const s = new Set<string>();
    for (const c of list) if (c.status) s.add(c.status);
    return Array.from(s).sort();
  }, [list]);

  // Filtros ativos (para contagem/rótulo/limpar)
  const filtrosAtivos = useMemo(() => {
    const arr: string[] = [];
    if (q.trim()) arr.push("Busca");
    if (filtroConvenio !== "todos") arr.push("Convênio");
    if (filtroInicio !== "todos") arr.push("Início");
    if (filtroTermino !== "todos") arr.push("Término");
    if (filtroMensal !== "todos") arr.push("Mensal");
    if (filtroProgresso !== "todas") arr.push("Parcelas");
    if (filtroSituacao !== "todas") arr.push("Situação");
    if (filtroVendedor !== "todos") arr.push("Vendedor");
    if (filtroStatus !== "todos") arr.push("Status");
    return arr;
  }, [q, filtroConvenio, filtroInicio, filtroTermino, filtroMensal, filtroProgresso, filtroSituacao, filtroVendedor, filtroStatus]);
  const temFiltroAtivo = filtrosAtivos.length > 0;

  const limparFiltros = () => {
    setQ("");
    setFiltroConvenio("todos");
    setFiltroInicio("todos");
    setFiltroTermino("todos");
    setFiltroMensal("todos");
    setFiltroProgresso("todas");
    setFiltroSituacao("todas");
    setFiltroVendedor("todos");
    setFiltroStatus("todos");
    setPagina(1);
  };

  // Paginação
  const totalPaginas = Math.max(1, Math.ceil(filtered.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioIdx = (paginaAtual - 1) * POR_PAGINA;
  const paginados = filtered.slice(inicioIdx, inicioIdx + POR_PAGINA);
  // Reset página ao mudar filtros/busca/ordem
  useEffect(() => {
    setPagina(1);
  }, [q, sortPaciente, filtroConvenio, filtroInicio, filtroTermino, filtroMensal, filtroProgresso, filtroSituacao, filtroVendedor, filtroStatus]);

  if (view === "new") {
    return (
      <NovoContratoForm
        onBack={() => setView("list")}
        convenios={convenios}
        clinicaId={clinicaAtual!.clinica_id}
        userId={user?.id ?? null}
        modulo={modulo}
        onCreated={async (contratoId) => {
          setView("list");
          const { data } = await supabase
            .from("contratos_assinatura")
            .select("*")
            .eq("id", contratoId)
            .maybeSingle();
          if (data) {
            setDetailInitialTab("dados");
            setDetail(data as Contrato);
          }
          load();
        }}
      />
    );
  }

  if (detail) {
    return (
      <DetalheContrato
        contrato={detail}
        initialTab={detailInitialTab}
        modulo={modulo}
        onBack={() => {
          setDetail(null);
          setDetailInitialTab("resumo");
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-primary" />
          Contratos
        </h1>
        {podeEscrever && (
          <Button onClick={() => setView("new")} disabled={convenios.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Vendas
          </Button>
        )}
      </div>
      {convenios.length === 0 && !loading ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          Cadastre um convênio antes em <strong>Cartão de Benefícios → Convênios</strong>.
        </div>
      ) : null}
      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por número ou paciente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => setSortPaciente((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))}
                  className="inline-flex items-center gap-1 font-bold uppercase tracking-wide hover:opacity-80"
                  title="Ordenar por paciente"
                >
                  PACIENTE
                  <span className="text-[10px] text-muted-foreground">
                    {sortPaciente === "asc" ? "A→Z" : sortPaciente === "desc" ? "Z→A" : "↕"}
                  </span>
                </button>
              </TableHead>
              <TableHead>TIPO DE CONVÊNIO</TableHead>
              <TableHead>
                <Select value={filtroInicio} onValueChange={(v) => setFiltroInicio(v as typeof filtroInicio)}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      INÍCIO
                      {filtroInicio !== "todos" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="ano">Este ano</SelectItem>
                    <SelectItem value="anterior">Anos anteriores</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filtroTermino} onValueChange={(v) => setFiltroTermino(v as typeof filtroTermino)}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      TÉRMINO
                      {filtroTermino !== "todos" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="vencidos">Vencidos</SelectItem>
                    <SelectItem value="30d">Vencem em 30 dias</SelectItem>
                    <SelectItem value="90d">Vencem em 90 dias</SelectItem>
                    <SelectItem value="sem_data">Sem data</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filtroMensal} onValueChange={(v) => setFiltroMensal(v as typeof filtroMensal)}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      MENSAL
                      {filtroMensal !== "todos" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="zero">R$ 0,00</SelectItem>
                    <SelectItem value="ate100">Até R$ 100</SelectItem>
                    <SelectItem value="100a200">R$ 100 a R$ 200</SelectItem>
                    <SelectItem value="acima200">Acima de R$ 200</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filtroProgresso} onValueChange={(v) => setFiltroProgresso(v as typeof filtroProgresso)}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      PARCELAS
                      {filtroProgresso !== "todas" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="sem_pag">Sem pagamentos</SelectItem>
                    <SelectItem value="andamento">Em andamento</SelectItem>
                    <SelectItem value="quitadas">Quitadas</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filtroSituacao} onValueChange={(v) => setFiltroSituacao(v as typeof filtroSituacao)}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      SITUAÇÃO
                      {filtroSituacao !== "todas" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="em_dia">Em dia</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      VENDEDOR
                      {filtroVendedor !== "todos" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sem">Sem vendedor</SelectItem>
                    {vendedorOpcoes.map(([id, nome]) => (
                      <SelectItem key={id} value={id}>{nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      STATUS
                      {filtroStatus !== "todos" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {statusOpcoes.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                  Nenhum contrato.
                </TableCell>
              </TableRow>
            ) : null}
            {filtered.map((c) => {
              const agg = parcAgg[c.id];
              const emDia = !agg || !agg.temAtrasada;
              return (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetail(c)}>
                <TableCell className="font-semibold">{c.numero}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{c.paciente_nome}</span>
                    {c.tabela_legada ? (
                      <Badge
                        variant="outline"
                        className="text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                      >
                        Tabela antiga — migrar {c.migrar_apos ? `em ${fmtD(c.migrar_apos)}` : ""}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {convenios.find((cv) => cv.id === c.convenio_id)?.nome ?? "—"}
                </TableCell>
                <TableCell>{fmtD(c.data_inicio)}</TableCell>
                <TableCell>{fmtD(c.data_fim ?? addUmAno(c.data_inicio))}</TableCell>
                <TableCell>{BRL(c.valor_mensal)}</TableCell>
                <TableCell className="tabular-nums">
                  {agg ? `${agg.pagas} / ${agg.total}` : "—"}
                </TableCell>
                <TableCell>
                  {c.status === "cancelado" ? (
                    <Badge variant="outline" className="text-muted-foreground">—</Badge>
                  ) : emDia ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Em dia</Badge>
                  ) : (
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Pendente</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {c.criado_por && vendedores[c.criado_por] ? (
                    <span>{vendedores[c.criado_por].trim().split(/\s+/).slice(0, 2).join(" ")}</span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={c.status === "ativo" ? "default" : "secondary"}
                    className={
                      c.status === "cancelado" ? "bg-red-600 text-black hover:bg-red-600" : undefined
                    }
                  >
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NovoContratoForm({
  onBack,
  convenios,
  clinicaId,
  userId,
  onCreated,
  modulo = "contratos",
}: {
  onBack: () => void;
  convenios: Convenio[];
  modulo?: string;
  clinicaId: string;
  userId: string | null;
  onCreated: (contratoId: string) => void;
}) {
  const podeEscrever = usePodeEscrever(modulo);
  const [convenioId, setConvenioId] = useState(convenios[0]?.id ?? "");
  const convenio = convenios.find((c) => c.id === convenioId);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [titular, setTitular] = useState<Paciente | null>(null);
  const [clientes, setClientes] = useState<Paciente[]>([]);
  const [titularOpen, setTitularOpen] = useState(false);
  const [depOpen, setDepOpen] = useState(false);
  const [valor, setValor] = useState(0);
  const [taxa, setTaxa] = useState(0);
  const [faixaId, setFaixaId] = useState<string>("");
  const [diaVenc, setDiaVenc] = useState(10);
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [mensalidadesJaPagas, setMensalidadesJaPagas] = useState(0);
  const [tipoCobranca, setTipoCobranca] = useState<"boleto" | "carne" | null>(null);
  const [obs, setObs] = useState("");
  const [deps, setDeps] = useState<Array<Paciente & { parentesco: string; tipo: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [faceOpen, setFaceOpen] = useState<null | "titular" | number>(null);
  const [editarPaciente, setEditarPaciente] = useState<null | {
    alvo: "titular" | number;
    focus?: "email" | "telefone";
  }>(null);
  const [quickCreate, setQuickCreate] = useState<null | {
    alvo: "titular" | "dependente";
    nome: string;
  }>(null);
  const gerarBoletosFn = useServerFn(gerarBoletosContrato);
  // Duplicidade: verifica se titular já tem contrato ativo nesta clínica
  const [titularContratoAtivo, setTitularContratoAtivo] = useState<number | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);

  useEffect(() => {
    setTitularContratoAtivo(null);
    if (!titular) return;
    let cancel = false;
    (async () => {
      setCheckingDup(true);
      const { data } = await supabase
        .from("contratos_assinatura")
        .select("numero")
        .eq("clinica_id", clinicaId)
        .eq("paciente_id", titular.id)
        .eq("status", "ativo")
        .limit(1)
        .maybeSingle();
      if (!cancel) {
        setTitularContratoAtivo((data as { numero: number } | null)?.numero ?? null);
        setCheckingDup(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [titular?.id, clinicaId]);

  const emailValido = (e?: string | null) => !!e && /.+@.+\..+/.test(e);
  const OBS_MAX = 1000;
  const obsSanitizedLen = obs.trim().length;
  const dataHoje = new Date().toISOString().slice(0, 10);
  const dataAvisoExtrema = (() => {
    if (!dataInicio) return null;
    const d = new Date(dataInicio + "T00:00:00").getTime();
    const hoje = new Date(dataHoje + "T00:00:00").getTime();
    const dias = (d - hoje) / 86400000;
    if (dias < -7) return `Data de início está ${Math.abs(Math.round(dias))} dias no passado — confirme.`;
    if (dias > 180) return `Data de início está muito no futuro (${Math.round(dias)} dias). Confirme.`;
    return null;
  })();

  const podeSalvar =
    !!titular &&
    !!convenio &&
    !saving &&
    !checkingDup &&
    titularContratoAtivo === null &&
    obsSanitizedLen <= OBS_MAX;

  useEffect(() => {
    if (convenio) {
      setValor(Number(convenio.valor_mensal));
      setTaxa(Number(convenio.taxa_adesao));
    }
  }, [convenioId]);

  // A busca de pacientes é feita sob demanda via RPC (PatientSearchInput),
  // suportando nome, CPF, prontuário, nº de pasta e data de nascimento.
  // Após selecionar, buscamos email + face_descriptor que não vêm na RPC.
  async function carregarPacienteCompleto(p: PatientOption): Promise<Paciente> {
    const { data } = await supabase
      .from("pacientes")
      .select("id, nome, cpf, telefone, email, face_descriptor")
      .eq("id", p.id)
      .maybeSingle();
    return (
      (data as Paciente | null) ?? {
        id: p.id,
        nome: p.nome,
        cpf: p.cpf,
        telefone: p.telefone,
        email: null,
        face_descriptor: null,
      }
    );
  }

  // Carrega faixas (por vidas) e benefícios do convênio selecionado
  useEffect(() => {
    (async () => {
      if (!convenioId) {
        setFaixas([]);
        return;
      }
      const fx = await supabase
        .from("cb_convenio_faixas")
        .select("*")
        .eq("convenio_id", convenioId)
        .order("vidas_de");
      setFaixas((fx.data ?? []) as Faixa[]);
    })();
  }, [convenioId]);

  // Quando faixas mudam (troca de convênio), pré-seleciona a faixa que cobre titular+deps atuais
  useEffect(() => {
    if (!convenio) return;
    if (faixas.length === 0) {
      setFaixaId("");
      setValor(Number(convenio.valor_mensal));
      return;
    }
    const vidasAtuais = (titular ? 1 : 0) + deps.length;
    const inicial =
      faixas.find((f) => vidasAtuais >= f.vidas_de && (f.vidas_ate == null || vidasAtuais <= f.vidas_ate)) ?? faixas[0];
    setFaixaId(inicial.id);
    setValor(Number(inicial.valor_mensal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faixas]);

  // Quando o usuário muda a faixa manualmente, atualiza o valor mensal
  useEffect(() => {
    if (!faixaId) return;
    const f = faixas.find((x) => x.id === faixaId);
    if (f) setValor(Number(f.valor_mensal));
  }, [faixaId, faixas]);

  const labelFaixa = (f: Faixa) => {
    const range =
      f.vidas_ate == null
        ? `${f.vidas_de}+ pessoas`
        : f.vidas_ate === f.vidas_de
          ? `${f.vidas_de} ${f.vidas_de === 1 ? "pessoa" : "pessoas"}`
          : `${f.vidas_de} a ${f.vidas_ate} pessoas`;
    return `${range} — ${BRL(Number(f.valor_mensal))}`;
  };

  const addDep = (p: Paciente) => {
    if (!convenio) return;
    const max = Number(convenio.max_dependentes ?? 0) || 0;
    if (deps.length >= max) {
      return toast.error(
        max === 0 ? "Este convênio não permite dependentes." : `Limite de ${max} dependentes atingido.`,
      );
    }
    if (deps.find((d) => d.id === p.id) || titular?.id === p.id) return;
    setDeps([...deps, { ...p, parentesco: "", tipo: "dependente" }]);
    setDepOpen(false);
  };

  const salvar = async () => {
    if (!podeEscrever) return toast.error("Você não tem permissão de edição neste módulo.");
    if (!titular || !convenio) return toast.error("Selecione paciente e convênio");
    if (titularContratoAtivo !== null) {
      return toast.error(
        `Este titular já possui um contrato ativo (#${titularContratoAtivo}). Cancele o contrato anterior antes de criar um novo.`,
      );
    }
    const maxDep = Number(convenio.max_dependentes ?? 0) || 0;
    if (deps.length > maxDep) {
      return toast.error(
        maxDep === 0 ? "Este convênio não permite dependentes." : `Limite de ${maxDep} dependentes excedido.`,
      );
    }
    // Sanitiza observações (remove HTML/scripts) e aplica limite
    const obsClean = DOMPurify.sanitize(obs.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (obsClean.length > OBS_MAX) {
      return toast.error(`Observações: máximo ${OBS_MAX} caracteres.`);
    }
    setSaving(true);
    // Rede de segurança: revalida duplicidade no submit (o estado já bloqueia o botão)
    const { data: jaAtivo } = await supabase
      .from("contratos_assinatura")
      .select("id, numero")
      .eq("clinica_id", clinicaId)
      .eq("paciente_id", titular.id)
      .eq("status", "ativo")
      .limit(1)
      .maybeSingle();
    if (jaAtivo) {
      setSaving(false);
      return toast.error(
        `Este titular já possui um contrato ativo (#${(jaAtivo as { numero: number }).numero}). Cancele o contrato anterior antes de criar um novo.`,
      );
    }
    const { data: contrato, error } = await supabase
      .from("contratos_assinatura")
      .insert({
        clinica_id: clinicaId,
        convenio_id: convenio.id,
        paciente_id: titular.id,
        paciente_nome: titular.nome,
        data_inicio: dataInicio,
        data_fim: addUmAno(dataInicio),
        dia_vencimento: diaVenc,
        valor_mensal: valor,
        taxa_adesao: taxa,
        num_parcelas: convenio.num_parcelas,
        forma_pagamento: tipoCobranca ?? null,
        observacoes: obsClean,
        criado_por: userId,
      })
      .select("*")
      .single();
    if (error || !contrato) {
      setSaving(false);
      return mostrarErro(error);
    }

    if (deps.length > 0) {
      const { error: depErr } = await supabase.from("contrato_dependentes").insert(
        deps.map((d) => ({
          contrato_id: contrato.id,
          paciente_id: d.id,
          paciente_nome: d.nome,
          parentesco: d.parentesco || null,
          tipo: d.tipo,
        })),
      );
      if (depErr) {
        toast.error(
          `Contrato #${contrato.numero} criado, mas ${deps.length} dependente(s) não foram salvos. Reabra o contrato e adicione manualmente.`,
        );
      }
    }

    // Gerar cobrancas: taxa de adesao separada da mensalidade.
    const base = new Date(dataInicio + "T00:00:00");
    const valorParcela = valor + (tipoCobranca === "boleto" ? TAXA_BOLETO : 0);
    const primeiraData = new Date(base.getFullYear(), base.getMonth(), diaVenc);
    const primeiraVencimento = primeiraData.toISOString().slice(0, 10);
    const parcelas = Array.from({ length: convenio.num_parcelas }, (_, i) => {
      const venc = new Date(base.getFullYear(), base.getMonth() + i, diaVenc);
      const jaPago = i < mensalidadesJaPagas;
      const vencStr = venc.toISOString().slice(0, 10);
      // Taxa de adesão só na 1ª parcela. Se o operador informou parcelas
      // "já pagas" (contrato retroativo), a taxa também já foi paga e vai zero.
      const taxaParcela = i === 0 && !jaPago ? Number(taxa || 0) : 0;
      return {
        contrato_id: contrato.id,
        clinica_id: clinicaId,
        numero_parcela: i + 1,
        vencimento: vencStr,
        valor: valorParcela,
        taxa_adesao: taxaParcela,
        status: jaPago ? "pago" : "pendente",
        ...(jaPago ? { pago_em: vencStr, valor_pago: valorParcela } : {}),
      };
    });
    const taxaAdesao = Number(taxa) || 0;
    const cobrancas = taxaAdesao > 0 && mensalidadesJaPagas === 0
      ? [
          {
            contrato_id: contrato.id,
            clinica_id: clinicaId,
            numero_parcela: 0,
            vencimento: primeiraVencimento,
            valor: taxaAdesao,
            status: "pendente",
            observacoes: "Taxa de adesao cobrada somente na primeira mensalidade.",
          },
          ...parcelas,
        ]
      : parcelas;
    const { error: mensErr } = await supabase.from("contrato_mensalidades").insert(cobrancas);
    if (mensErr) {
      toast.error(`Contrato #${contrato.numero} criado, mas as mensalidades não foram geradas: ${mensErr.message}`);
    }

    setSaving(false);
    toast.success(`Contrato #${contrato.numero} criado com ${convenio.num_parcelas} mensalidades${taxaAdesao > 0 && mensalidadesJaPagas === 0 ? " e taxa de adesao separada" : ""}`);

    // Pós-criação: gerar carnê ou boletos com timeout de 15s (não trava UI)
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race<T>([
        p,
        new Promise<T>((_, r) => setTimeout(() => r(new Error("TIMEOUT")), ms)),
      ]);
    if (tipoCobranca === "carne") {
      try {
        await withTimeout(gerarCarnePDF(contrato.id), 15000);
      } catch (e) {
        if ((e as Error).message === "TIMEOUT") {
          toast.info("Geração do carnê demorou mais que o esperado — tente reimprimir na lista de contratos.");
        } else {
          mostrarErro(e);
        }
      }
    } else if (tipoCobranca === "boleto") {
      try {
        const res = await withTimeout(gerarBoletosFn({ data: { contratoId: contrato.id } }), 15000);
        toast.info(res.mensagem);
      } catch (e) {
        if ((e as Error).message === "TIMEOUT") {
          toast.info("Emissão dos boletos ainda está em processamento — verifique a lista de contratos em instantes.");
        } else {
          mostrarErro(e);
        }
      }
    }
    onCreated(contrato.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-primary" />
          Novo contrato
        </h1>
        <div />
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className={faixas.length > 0 ? undefined : "col-span-2"}>
              <Label>Convênio</Label>
              <Select value={convenioId} onValueChange={setConvenioId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {faixas.length > 0 ? (
              <div>
                <Label>Nº de pessoas no contrato</Label>
                <Select value={faixaId} onValueChange={setFaixaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a faixa…" />
                  </SelectTrigger>
                  <SelectContent>
                    {faixas.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {labelFaixa(f)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  O valor mensal é definido pela faixa selecionada (cadastrada no convênio).
                </p>
              </div>
            ) : null}
            <div className="col-span-2">
              <Label>Paciente titular</Label>
              {titular ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between rounded-md border p-2 bg-muted/30">
                    <span className="font-medium flex items-center gap-2">
                      {titular.nome} {titular.cpf ? `— ${titular.cpf}` : ""}
                      {titular.face_descriptor && titular.face_descriptor.length > 0 ? (
                        <Badge variant="default" className="gap-1">
                          <Check className="h-3 w-3" />
                          Foto
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400">
                          Sem foto
                        </Badge>
                      )}
                      {!titular.email ? (
                        <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400">
                          <Mail className="h-3 w-3" />
                          Sem e-mail
                        </Badge>
                      ) : !emailValido(titular.email) ? (
                        <Badge variant="outline" className="gap-1 text-red-600 border-red-400">
                          <Mail className="h-3 w-3" />
                          E-mail inválido
                        </Badge>
                      ) : null}
                      {checkingDup ? (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Verificando…
                        </Badge>
                      ) : titularContratoAtivo !== null ? (
                        <Badge variant="outline" className="gap-1 text-red-600 border-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          Já possui contrato #{titularContratoAtivo}
                        </Badge>
                      ) : null}
                    </span>
                    <div className="flex gap-1">
                      {podeEscrever && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditarPaciente({ alvo: "titular" })}
                          title="Editar e-mail e telefone"
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                      )}
                      {podeEscrever && (
                        <Button size="sm" variant="outline" onClick={() => setFaceOpen("titular")}>
                          <Camera className="h-3 w-3 mr-1" />
                          {titular.face_descriptor?.length ? "Refazer foto" : "Tirar foto"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setTitular(null)}>
                        Trocar
                      </Button>
                    </div>
                  </div>
                  {!titular.email ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Titular precisa ter e-mail para acessar o app.
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => setEditarPaciente({ alvo: "titular", focus: "email" })}
                      >
                        <Mail className="h-3 w-3 mr-1" />
                        Cadastrar e-mail agora
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <PatientSearchInput
                  clinicaIdsOverride={[clinicaId]}
                  placeholder="Buscar por nome, CPF, prontuário, pasta ou nascimento…"
                  onSelect={async (p) => {
                    if (!p) return;
                    if (deps.find((d) => d.id === p.id)) {
                      toast.error("Esse paciente já está como dependente.");
                      return;
                    }
                    const full = await carregarPacienteCompleto(p);
                    setTitular(full);
                  }}
                  onRequestCreate={(q) => setQuickCreate({ alvo: "titular", nome: q })}
                />
              )}
            </div>
            <div>
              <Label>Data início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              {dataAvisoExtrema ? (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {dataAvisoExtrema}
                </p>
              ) : null}
            </div>
            <div>
              <Label>Data término</Label>
              <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-semibold">
                {fmtD(addUmAno(dataInicio))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Calculada automaticamente: 1 ano após a data de início.
              </p>
            </div>
            <div>
              <Label>Dia de vencimento</Label>
              <Select value={String(diaVenc)} onValueChange={(v) => setDiaVenc(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20, 25, 30].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(() => {
              // Mostra campo "já pagas" quando data de início é anterior ao mês atual
              if (!dataInicio || !convenio) return null;
              const ini = new Date(dataInicio + "T00:00:00");
              const hoje = new Date();
              const mesesDecorridos =
                (hoje.getFullYear() - ini.getFullYear()) * 12 + (hoje.getMonth() - ini.getMonth());
              if (mesesDecorridos < 1) return null;
              const maxPagas = Math.max(0, convenio.num_parcelas - 1);
              const sugestao = Math.min(mesesDecorridos, maxPagas);
              return (
                <div className="col-span-2">
                  <Label>Mensalidades já pagas anteriormente</Label>
                  <Input
                    type="number"
                    min={0}
                    max={maxPagas}
                    value={mensalidadesJaPagas}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(maxPagas, Number(e.target.value) || 0));
                      setMensalidadesJaPagas(v);
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use para lançar contratos antigos já em andamento. As primeiras {mensalidadesJaPagas || "N"} parcelas serão registradas como <strong>pagas</strong> e apenas as {convenio.num_parcelas - mensalidadesJaPagas} restantes ficarão em aberto. Sugestão com base na data: {sugestao}.
                  </p>
                </div>
              );
            })()}
            <div>
              <Label>Valor mensal</Label>
              <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-semibold">
                {BRL(valor)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {faixas.length > 0 ? "Definido pela faixa de pessoas selecionada acima." : "Definido pelo convênio."}
                {tipoCobranca === "boleto" ? (
                  <span className="block text-amber-600 font-medium">
                    + {BRL(TAXA_BOLETO)} de taxa de boleto por parcela — total da parcela: {BRL(valor + TAXA_BOLETO)}
                  </span>
                ) : null}
              </p>
            </div>
            <div>
              <Label>Taxa de adesão</Label>
              <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-semibold">{BRL(taxa)}</div>
              <p className="text-xs text-muted-foreground mt-1">Cobrança única, definida pelo convênio.</p>
            </div>
            <div className="col-span-2">
              <Label>
                Tipo de cobrança <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <div className="grid grid-cols-2 gap-3 mt-1">
                {[
                  {
                    v: "boleto" as const,
                    icon: Barcode,
                    title: "Boleto bancário",
                    desc: `Geramos um boleto via banco para cada parcela. Taxa de ${BRL(TAXA_BOLETO)} por boleto.`,
                  },
                  {
                    v: "carne" as const,
                    icon: FileText,
                    title: "Carnê interno",
                    desc: "Geramos um PDF de carnê com todas as parcelas para baixar/imprimir. Sem taxa.",
                  },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const ativo = tipoCobranca === opt.v;
                  return (
                    <button
                      type="button"
                      key={opt.v}
                      onClick={() => setTipoCobranca(ativo ? null : opt.v)}
                      className={`text-left rounded-md border p-3 transition flex gap-3 items-start ${
                        ativo ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Icon className={`h-5 w-5 mt-0.5 ${ativo ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="flex-1">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          {opt.title}
                          {ativo ? <Check className="h-4 w-4 text-primary" /> : null}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                A forma de pagamento real (Dinheiro / PIX / Cartão / etc.) será escolhida apenas na hora de baixar cada
                parcela.
              </p>
            </div>
            <div className="col-span-2 border-t pt-3">
              <Label>Dependentes {convenio ? `(${deps.length}/${convenio.max_dependentes ?? 0})` : ""}</Label>
              {convenio && deps.length >= (Number(convenio?.max_dependentes ?? 0) || 0) ? (
                <div className="w-full mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {(convenio.max_dependentes ?? 0) === 0
                    ? "Convênio sem dependentes"
                    : `Limite atingido (${deps.length}/${convenio.max_dependentes})`}
                </div>
              ) : (
                <div className="mt-1">
                  <PatientSearchInput
                    clinicaIdsOverride={[clinicaId]}
                    placeholder="Adicionar dependente — busque por nome, CPF, prontuário…"
                    onSelect={async (p) => {
                      if (!p) return;
                      if (p.id === titular?.id) {
                        toast.error("Esse paciente já é o titular.");
                        return;
                      }
                      if (deps.find((d) => d.id === p.id)) {
                        toast.error("Dependente já adicionado.");
                        return;
                      }
                      const full = await carregarPacienteCompleto(p);
                      addDep(full);
                    }}
                    onRequestCreate={(q) => setQuickCreate({ alvo: "dependente", nome: q })}
                  />
                </div>
              )}
              {deps.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {deps.map((d, i) => (
                    <div key={d.id} className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-12 sm:col-span-3 text-sm truncate flex items-center gap-1">
                        {d.nome}
                        {d.face_descriptor && d.face_descriptor.length > 0 ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : null}
                      </span>
                      <Select
                        value={d.parentesco}
                        onValueChange={(v) => setDeps(deps.map((x, j) => (j === i ? { ...x, parentesco: v } : x)))}
                      >
                        <SelectTrigger className="col-span-6 sm:col-span-3 h-8">
                          <SelectValue placeholder="Parentesco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Filho(a)">Filho(a)</SelectItem>
                          <SelectItem value="Cônjuge">Cônjuge</SelectItem>
                          <SelectItem value="Pai">Pai</SelectItem>
                          <SelectItem value="Mãe">Mãe</SelectItem>
                          <SelectItem value="Irmão(ã)">Irmão(ã)</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="col-span-6 sm:col-span-2 text-xs text-muted-foreground self-center">Dependente</div>
                      {podeEscrever && (
                        <Button size="sm" variant="outline" className="col-span-6 sm:col-span-2 h-8" onClick={() => setFaceOpen(i)}>
                          <Camera className="h-3 w-3 mr-1" />
                          {d.face_descriptor?.length ? "Refazer" : "Foto"}
                        </Button>
                      )}
                      {podeEscrever && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="col-span-3 sm:col-span-1 h-8 px-0"
                          onClick={() => setEditarPaciente({ alvo: i })}
                          title="Editar e-mail e telefone"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="col-span-3 sm:col-span-1"
                        onClick={() => setDeps(deps.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={obs}
                maxLength={OBS_MAX}
                onChange={(e) => setObs(e.target.value)}
              />
              <p
                className={`text-xs mt-1 text-right ${
                  obsSanitizedLen > OBS_MAX ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                {obsSanitizedLen} / {OBS_MAX} caracteres
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={onBack}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={!podeSalvar || !podeEscrever}
              title={
                titularContratoAtivo !== null
                  ? `Titular já possui contrato ativo #${titularContratoAtivo}`
                  : obsSanitizedLen > OBS_MAX
                    ? `Observações excedem ${OBS_MAX} caracteres`
                    : undefined
              }
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando…
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4 mr-2" />
                  Salvar e imprimir
                </>
              )}
            </Button>
          </div>
          {faceOpen !== null ? (
            <FaceCaptureDialog
              open={faceOpen !== null}
              onClose={() => setFaceOpen(null)}
              titulo={
                faceOpen === "titular"
                  ? `Foto — ${titular?.nome ?? "Titular"}`
                  : `Foto — ${deps[faceOpen as number]?.nome ?? "Dependente"}`
              }
              onCaptured={async (descriptor) => {
                if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
                const isTitular = faceOpen === "titular";
                const idx = typeof faceOpen === "number" ? faceOpen : -1;
                const alvoId = isTitular ? titular!.id : deps[idx].id;
                const { error } = await supabase
                  .from("pacientes")
                  .update({ face_descriptor: descriptor })
                  .eq("id", alvoId);
                if (error) throw error;
                if (isTitular) setTitular({ ...titular!, face_descriptor: descriptor });
                else setDeps(deps.map((x, j) => (j === idx ? { ...x, face_descriptor: descriptor } : x)));
                toast.success("Foto registrada");
              }}
            />
          ) : null}
          <EditarPacienteRapidoDialog
            open={editarPaciente !== null}
            onOpenChange={(v) => {
              if (!v) setEditarPaciente(null);
            }}
            paciente={
              editarPaciente === null
                ? null
                : editarPaciente.alvo === "titular"
                  ? titular
                  : (deps[editarPaciente.alvo] ?? null)
            }
            focus={editarPaciente?.focus}
            onSaved={(atualizado) => {
              if (!editarPaciente) return;
              if (editarPaciente.alvo === "titular") {
                setTitular((prev) =>
                  prev ? { ...prev, email: atualizado.email, telefone: atualizado.telefone } : prev,
                );
              } else {
                const idx = editarPaciente.alvo;
                setDeps((prev) =>
                  prev.map((x, j) =>
                    j === idx ? { ...x, email: atualizado.email, telefone: atualizado.telefone } : x,
                  ),
                );
              }
            }}
          />
          <QuickPatientDialog
            open={quickCreate !== null}
            onOpenChange={(v) => { if (!v) setQuickCreate(null); }}
            clinicaId={clinicaId}
            nomeInicial={quickCreate?.nome}
            onCreated={async (p) => {
              if (!quickCreate) return;
              const full = await carregarPacienteCompleto(p);
              if (quickCreate.alvo === "titular") {
                if (deps.find((d) => d.id === p.id)) {
                  toast.error("Esse paciente já está como dependente.");
                  return;
                }
                setTitular(full);
              } else {
                if (p.id === titular?.id) {
                  toast.error("Esse paciente já é o titular.");
                  return;
                }
                if (deps.find((d) => d.id === p.id)) {
                  toast.error("Dependente já adicionado.");
                  return;
                }
                addDep(full);
              }
              setQuickCreate(null);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DetalheContrato({
  contrato,
  onBack,
  initialTab = "resumo",
  modulo = "contratos",
}: {
  contrato: Contrato;
  onBack: () => void;
  initialTab?: "resumo" | "dados" | "contrato";
  modulo?: string;
}) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever(modulo);
  const DadosField = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{value || "—"}</div>
    </div>
  );
  const [mens, setMens] = useState<Mens[]>([]);
  const [extraRecebido, setExtraRecebido] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
  const [drill, setDrill] = useState<null | "pagas" | "recebido" | "areceber">(null);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [convenio, setConvenio] = useState<any>(null);
  const [clinica, setClinica] = useState<any>(null);
  const [pacienteFull, setPacienteFull] = useState<any>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [loading, setLoading] = useState(true);
  const gerarBoletosFn = useServerFn(gerarBoletosContrato);

  // Inclusão/exclusão de dependentes pós-venda
  const [incOpen, setIncOpen] = useState(false);
  const [incPaciente, setIncPaciente] = useState<PatientOption | null>(null);
  const [incParentesco, setIncParentesco] = useState<string>("");
  const [incTipo, setIncTipo] = useState<string>("dependente");
  const [incSaving, setIncSaving] = useState(false);
  const [excAlvo, setExcAlvo] = useState<Dep | null>(null);
  const [termoOpen, setTermoOpen] = useState(false);
  const [termoMovimento, setTermoMovimento] = useState<"Inclusão" | "Exclusão">("Inclusão");
  const [termoDep, setTermoDep] = useState<Dep | null>(null);

  // Cancelamento do contrato
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [canceladoEm, setCanceladoEm] = useState<string | null>(contrato.cancelado_em ?? null);
  const [cancelMotivoAtual, setCancelMotivoAtual] = useState<string | null>(contrato.cancelamento_motivo ?? null);
  const cancelado = !!canceladoEm;
  // Valor mensal vigente (atualizado quando recalculamos as parcelas em aberto)
  const [valorMensalAtual, setValorMensalAtual] = useState<number>(Number(contrato.valor_mensal));
  useEffect(() => {
    setValorMensalAtual(Number(contrato.valor_mensal));
  }, [contrato.id]);

  // Edição manual de valor mensal e dia de vencimento (revisão contrato a contrato)
  const [editValor, setEditValor] = useState<string>(String(Number(contrato.valor_mensal ?? 0).toFixed(2)));
  const [editDia, setEditDia] = useState<string>(String(contrato.dia_vencimento ?? 10));
  const [savingDados, setSavingDados] = useState(false);
  const [regerarFuturas, setRegerarFuturas] = useState(true);
  useEffect(() => {
    setEditValor(String(Number(contrato.valor_mensal ?? 0).toFixed(2)));
    setEditDia(String(contrato.dia_vencimento ?? 10));
  }, [contrato.id]);

  // ---- Edição avançada ----
  // Liberado para todos os perfis: qualquer usuário com acesso ao contrato pode editar seus dados.
  const isAdmin = true;
  const [conveniosAdm, setConveniosAdm] = useState<Array<{ id: string; nome: string }>>([]);
  const [admConvenioId, setAdmConvenioId] = useState<string>(contrato.convenio_id ?? "");
  const [admPaciente, setAdmPaciente] = useState<PatientOption | null>(null);
  const [admDataInicio, setAdmDataInicio] = useState<string>(contrato.data_inicio ?? "");
  const [admTaxaAdesao, setAdmTaxaAdesao] = useState<string>(String(Number(contrato.taxa_adesao ?? 0).toFixed(2)));
  const [admForma, setAdmForma] = useState<string>(contrato.forma_pagamento ?? "");
  const [admObs, setAdmObs] = useState<string>(contrato.observacoes ?? "");
  const [admFaixaId, setAdmFaixaId] = useState<string>("");
  const [savingAdm, setSavingAdm] = useState(false);
  const [retroDialog, setRetroDialog] = useState<{ open: boolean; parcelasPagas: string; dataInicio: string } | null>(null);
  const [regerandoRetro, setRegerandoRetro] = useState(false);
  useEffect(() => {
    setAdmConvenioId(contrato.convenio_id ?? "");
    setAdmDataInicio(contrato.data_inicio ?? "");
    setAdmTaxaAdesao(String(Number(contrato.taxa_adesao ?? 0).toFixed(2)));
    setAdmForma(contrato.forma_pagamento ?? "");
    setAdmObs(contrato.observacoes ?? "");
  }, [contrato.id]);

  // Carrega lista de convênios ativos (ADM)
  useEffect(() => {
    if (!isAdmin || !clinicaAtual?.clinica_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("cb_convenios")
        .select("id, nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome");
      if (!cancelled) setConveniosAdm(((data as any[]) ?? []).map((c) => ({ id: c.id, nome: c.nome })));
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, clinicaAtual?.clinica_id]);
  // Preenche paciente titular no combobox (ADM)
  useEffect(() => {
    if (!isAdmin) return;
    const pid = (contrato as any).paciente_id as string | null | undefined;
    if (!pid) {
      setAdmPaciente(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, telefone, data_nascimento, clinica_id")
        .eq("id", pid)
        .maybeSingle();
      if (!cancelled && data) setAdmPaciente(data as PatientOption);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, contrato.id]);

  const salvarContratoAdmin = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const taxa = Number(String(admTaxaAdesao).replace(",", "."));
    if (!admConvenioId) {
      toast.error("Selecione um convênio");
      return;
    }
    if (!admPaciente?.id) {
      toast.error("Selecione o paciente titular");
      return;
    }
    if (!admDataInicio) {
      toast.error("Informe a data de início");
      return;
    }
    if (!Number.isFinite(taxa) || taxa < 0) {
      toast.error("Taxa de adesão inválida");
      return;
    }
    const dataInicioAntiga = (contrato as any).data_inicio as string | null;
    setSavingAdm(true);
    // Se admin escolheu outra faixa, aplica novo valor_mensal
    const faixaEscolhida = admFaixaId ? faixas.find((f) => f.id === admFaixaId) : null;
    const novoValorMensal = faixaEscolhida ? Number(faixaEscolhida.valor_mensal) : null;
    const updatePayload: any = {
      convenio_id: admConvenioId,
      paciente_id: admPaciente.id,
      paciente_nome: admPaciente.nome,
      data_inicio: admDataInicio,
      taxa_adesao: taxa,
      forma_pagamento: admForma || null,
      observacoes: admObs || null,
    };
    if (novoValorMensal != null && novoValorMensal !== Number(valorMensalAtual)) {
      updatePayload.valor_mensal = novoValorMensal;
    }
    const { error } = await supabase
      .from("contratos_assinatura")
      .update(updatePayload)
      .eq("id", contrato.id);
    setSavingAdm(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    (contrato as any).convenio_id = admConvenioId;
    (contrato as any).paciente_id = admPaciente.id;
    (contrato as any).paciente_nome = admPaciente.nome;
    (contrato as any).data_inicio = admDataInicio;
    (contrato as any).taxa_adesao = taxa;
    (contrato as any).forma_pagamento = admForma || null;
    (contrato as any).observacoes = admObs || null;
    if (novoValorMensal != null && novoValorMensal !== Number(valorMensalAtual)) {
      (contrato as any).valor_mensal = novoValorMensal;
      setValorMensalAtual(novoValorMensal);
      // Recalcula parcelas em aberto para o novo valor
      const abertas = mens.filter((m) => !isAdesao(m) && m.status !== "pago");
      if (abertas.length > 0) {
        await Promise.all(
          abertas.map((m) => {
            const isBoleto = (m.forma_pagamento ?? (contrato as any).forma_pagamento) === "boleto";
            const v = novoValorMensal + (isBoleto ? TAXA_BOLETO : 0);
            return supabase.from("contrato_mensalidades").update({ valor: v }).eq("id", m.id);
          }),
        );
      }
    }
    toast.success("Contrato atualizado.");
    await load();
    // Se a data de início foi movida para o passado, oferecer regeneração com parcelas pagas.
    if (dataInicioAntiga && admDataInicio < dataInicioAntiga) {
      const hoje = new Date();
      const primDoMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const ini = new Date(admDataInicio + "T00:00:00");
      const iniMes = new Date(ini.getFullYear(), ini.getMonth(), 1);
      if (iniMes < primDoMesAtual) {
        const mesesCheios = (primDoMesAtual.getFullYear() - iniMes.getFullYear()) * 12 + (primDoMesAtual.getMonth() - iniMes.getMonth());
        const sugestao = Math.max(0, Math.min(12, mesesCheios));
        setRetroDialog({ open: true, parcelasPagas: String(sugestao), dataInicio: admDataInicio });
      }
    }
  };

  // Regenera as 12 parcelas a partir da nova data de início; as N primeiras entram como pagas.
  const regerarComPagas = async (n: number) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!retroDialog) return;
    const iniStr = retroDialog.dataInicio;
    if (!iniStr) return;
    const dia = Math.max(1, Math.min(31, Number((contrato as any).dia_vencimento) || 10));
    const valor = Number((contrato as any).valor_mensal ?? 0);
    const pagas = Math.max(0, Math.min(12, Math.floor(n)));
    setRegerandoRetro(true);
    // 1) Apaga pendentes existentes
    const { error: delErr } = await supabase
      .from("contrato_mensalidades")
      .delete()
      .eq("contrato_id", contrato.id)
      .eq("status", "pendente")
      .neq("numero_parcela", 0);
    if (delErr) {
      setRegerandoRetro(false);
      return mostrarErro(delErr);
    }
    // 2) Próximo número de parcela
    const { data: maxRow } = await supabase
      .from("contrato_mensalidades")
      .select("numero_parcela")
      .eq("contrato_id", contrato.id)
      .neq("numero_parcela", 0)
      .order("numero_parcela", { ascending: false })
      .limit(1);
    let prox = ((maxRow?.[0]?.numero_parcela ?? 0) as number) + 1;
    // 3) Gera 12 parcelas a partir do mês da nova data de início
    const ini = new Date(iniStr + "T00:00:00");
    const baseAno = ini.getFullYear();
    const baseMes = ini.getMonth();
    const rows: any[] = [];
    for (let i = 0; i < 12; i++) {
      const ref = new Date(baseAno, baseMes + i, 1);
      const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
      const d = Math.min(dia, lastDay);
      const venc = new Date(ref.getFullYear(), ref.getMonth(), d);
      const vencIso = venc.toISOString().slice(0, 10);
      const paga = i < pagas;
      rows.push({
        contrato_id: contrato.id,
        clinica_id: (contrato as any).clinica_id,
        numero_parcela: prox++,
        vencimento: vencIso,
        valor,
        status: paga ? "pago" : "pendente",
        pago_em: paga ? vencIso : null,
        valor_pago: paga ? valor : null,
      });
    }
    const { error: insErr } = await supabase.from("contrato_mensalidades").insert(rows);
    setRegerandoRetro(false);
    if (insErr) return mostrarErro(insErr, "falha ao gerar parcelas");
    setRetroDialog(null);
    toast.success(
      pagas > 0
        ? `${pagas} parcela${pagas === 1 ? "" : "s"} marcada${pagas === 1 ? "" : "s"} como paga${pagas === 1 ? "" : "s"} e ${12 - pagas} pendente${12 - pagas === 1 ? "" : "s"} gerada${12 - pagas === 1 ? "" : "s"}.`
        : "12 parcelas pendentes geradas.",
    );
    await load();
  };

  // Edição de parcelas (ADM)
  const atualizarParcela = async (
    id: string,
    patch: Partial<{ vencimento: string; valor: number | string }>,
  ) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const payload: any = { ...patch };
    if (payload.valor !== undefined) payload.valor = Number(String(payload.valor).replace(",", "."));
    const { error } = await supabase.from("contrato_mensalidades").update(payload).eq("id", id);
    if (error) return mostrarErro(error);
    setMens((rows) =>
      rows.map((r) =>
        r.id === id ? ({ ...r, ...(patch as any), valor: payload.valor ?? r.valor } as Mens) : r,
      ),
    );
  };
  const adicionarParcela = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const prox = mensalidades.reduce((mx, m) => Math.max(mx, Number(m.numero_parcela) || 0), 0) + 1;
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("contrato_mensalidades").insert({
      contrato_id: contrato.id,
      clinica_id: (contrato as any).clinica_id,
      numero_parcela: prox,
      vencimento: hoje,
      valor: Number(valorMensalAtual) || 0,
      status: "pendente",
    } as any);
    if (error) return mostrarErro(error);
    toast.success("Parcela adicionada.");
    await load();
  };
  const excluirParcela = async (id: string) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!confirm("Excluir esta parcela? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("contrato_mensalidades").delete().eq("id", id);
    if (error) return mostrarErro(error);
    toast.success("Parcela removida.");
    await load();
  };

  const salvarDadosFinanceiros = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const v = Number(String(editValor).replace(",", "."));
    const dia = Math.max(1, Math.min(31, Number(editDia) || 0));
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Valor mensal inválido");
      return;
    }
    if (!dia) {
      toast.error("Dia de vencimento inválido");
      return;
    }
    setSavingDados(true);
    const { error } = await supabase
      .from("contratos_assinatura")
      .update({ valor_mensal: v, dia_vencimento: dia })
      .eq("id", contrato.id);
    if (error) {
      setSavingDados(false);
      mostrarErro(error);
      return;
    }
    (contrato as any).valor_mensal = v;
    (contrato as any).dia_vencimento = dia;
    setValorMensalAtual(v);

    if (regerarFuturas) {
      const hoje = new Date().toISOString().slice(0, 10);
      // apaga parcelas pendentes futuras
      await supabase
        .from("contrato_mensalidades")
        .delete()
        .eq("contrato_id", contrato.id)
        .eq("status", "pendente")
        .neq("numero_parcela", 0)
        .gt("vencimento", hoje);
      // próximo número
      const { data: maxRow } = await supabase
        .from("contrato_mensalidades")
        .select("numero_parcela")
        .eq("contrato_id", contrato.id)
        .neq("numero_parcela", 0)
        .order("numero_parcela", { ascending: false })
        .limit(1);
      let prox = ((maxRow?.[0]?.numero_parcela ?? 0) as number) + 1;
      const inicio = new Date();
      inicio.setDate(1);
      const rows: any[] = [];
      for (let i = 1; i <= 12; i++) {
        const ref = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
        const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        const d = Math.min(dia, lastDay);
        const venc = new Date(ref.getFullYear(), ref.getMonth(), d);
        rows.push({
          contrato_id: contrato.id,
          clinica_id: (contrato as any).clinica_id,
          numero_parcela: prox++,
          vencimento: venc.toISOString().slice(0, 10),
          valor: v,
          status: "pendente",
        });
      }
      const { error: insErr } = await supabase.from("contrato_mensalidades").insert(rows);
      if (insErr) {
        setSavingDados(false);
        mostrarErro(insErr, "dados salvos, mas falha ao gerar parcelas");
        await load();
        return;
      }
    }
    setSavingDados(false);
    toast.success(regerarFuturas ? "Dados salvos e parcelas futuras atualizadas." : "Dados salvos.");
    await load();
  };

  const confirmarCancelamento = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const motivo = cancelMotivo.trim();
    if (!motivo) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    setCancelSaving(true);
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("contratos_assinatura")
      .update({
        status: "cancelado",
        cancelado_em: agora,
        cancelamento_motivo: motivo,
      } as any)
      .eq("id", contrato.id);
    setCancelSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Contrato cancelado");
    setCanceladoEm(agora);
    setCancelMotivoAtual(motivo);
    setCancelOpen(false);
    setCancelMotivo("");
  };

  // Diálogo de forma de pagamento (espelha o da agenda)
  const [pagMens, setPagMens] = useState<Mens | null>(null);
  const [formaPagOpen, setFormaPagOpen] = useState(false);
  const [lancOpen, setLancOpen] = useState(false);
  const [pagInitialForma, setPagInitialForma] = useState<string>("");

  const formaOpcoes: Array<{ forma: string; label: string }> = [
    { forma: "dinheiro", label: "Dinheiro" },
    { forma: "pix", label: "Pix" },
    { forma: "debito", label: "Cartão de Débito" },
    { forma: "credito", label: "Cartão de Crédito" },
    { forma: "boleto", label: "Boleto" },
    { forma: "manual", label: "Manual" },
  ];

  const load = async () => {
    setLoading(true);
    const [m, d, cv, cl, pa, fx] = await Promise.all([
      supabase.from("contrato_mensalidades").select("*").eq("contrato_id", contrato.id).order("numero_parcela"),
      supabase
        .from("contrato_dependentes")
        .select("id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, excluido_em, ativo")
        .eq("contrato_id", contrato.id),
      contrato.convenio_id
        ? supabase
            .from("cb_convenios")
            .select("nome, modelo_contrato, termo_inclusao_html, vigencia_meses, fidelidade_meses, max_dependentes")
            .eq("id", contrato.convenio_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("clinicas")
        .select("nome, cnpj, endereco, cidade, estado, telefone")
        .eq("id", (contrato as any).clinica_id ?? "")
        .maybeSingle(),
      supabase
        .from("pacientes")
        .select("cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep")
        .eq("id", (contrato as any).paciente_id ?? "")
        .maybeSingle(),
      contrato.convenio_id
        ? supabase.from("cb_convenio_faixas").select("*").eq("convenio_id", contrato.convenio_id).order("vidas_de")
        : Promise.resolve({ data: [] }),
    ]);
    setMens((m.data ?? []) as Mens[]);
    // Pagamentos avulsos importados (ex.: rateios MJ) vinculados ao paciente do contrato
    const pacienteId = (contrato as any).paciente_id as string | undefined;
    if (pacienteId) {
      const { data: avulsos } = await supabase
        .from("fin_lancamentos")
        .select("valor, descricao")
        .eq("clinica_id", (contrato as any).clinica_id)
        .eq("paciente_id", pacienteId)
        .eq("tipo", "receita")
        .eq("status", "confirmado");
      // A "Taxa de adesão" é cobrada junto com a 1ª mensalidade e vira um
      // lançamento financeiro próprio — não deve ser contada como parcela
      // extra (senão o "Pagas x/N" mostra 2/13 em vez de 2/12).
      // Continua no total Recebido, mas fora da contagem de parcelas.
      const rows = (avulsos ?? []) as Array<{ valor: number | string; descricao: string | null }>;
      const total = rows.reduce((s, r) => s + Number(r.valor || 0), 0);
      const count = rows.filter(
        (r) => !(r.descricao ?? "").toLowerCase().startsWith("taxa de adesão"),
      ).length;
      setExtraRecebido({ total, count });
    } else {
      setExtraRecebido({ total: 0, count: 0 });
    }
    const rows = (d.data ?? []) as any[];
    const pids = Array.from(new Set(rows.map((r) => r.paciente_id).filter(Boolean)));
    let cpfMap: Record<string, string | null> = {};
    if (pids.length) {
      const { data: pacs } = await supabase.from("pacientes").select("id, cpf").in("id", pids);
      cpfMap = Object.fromEntries((pacs ?? []).map((p: any) => [p.id, p.cpf]));
    }
    const depsRows = rows.map((r) => ({
      id: r.id,
      paciente_id: r.paciente_id,
      paciente_nome: r.paciente_nome,
      parentesco: r.parentesco,
      tipo: r.tipo,
      cpf: cpfMap[r.paciente_id] ?? null,
      incluido_em: r.incluido_em ?? null,
      excluido_em: r.excluido_em ?? null,
      ativo: !!r.ativo,
    })) as Dep[];
    // Ativos primeiro (por inclusão asc), depois excluídos (por exclusão desc)
    depsRows.sort((a, b) => {
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      if (a.ativo) return (a.incluido_em ?? "").localeCompare(b.incluido_em ?? "");
      return (b.excluido_em ?? "").localeCompare(a.excluido_em ?? "");
    });
    setDeps(depsRows);
    setConvenio(cv.data ?? null);
    setClinica(cl.data ?? null);
    setPacienteFull(pa.data ?? null);
    setFaixas(((fx as any).data ?? []) as Faixa[]);
    setLoading(false);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [contrato.id]);

  // Sincroniza a faixa "admin" com a faixa vigente (baseada no valor_mensal atual)
  useEffect(() => {
    if (!faixas.length) {
      setAdmFaixaId("");
      return;
    }
    const v = Number(valorMensalAtual);
    const match =
      faixas.find((f) => Number(f.valor_mensal) === v) ?? faixas[0];
    setAdmFaixaId(match?.id ?? "");
  }, [faixas, valorMensalAtual]);

  // Busca de pacientes agora é feita sob demanda pelo PatientSearchInput.

  const marcarPago = async (id: string, paga: boolean, forma?: string | null) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const patch = paga
      ? {
          status: "pago",
          pago_em: new Date().toISOString().slice(0, 10),
          ...(forma !== undefined ? { forma_pagamento: forma } : {}),
        }
      : { status: "pendente", pago_em: null, forma_pagamento: null };
    const { error } = await supabase.from("contrato_mensalidades").update(patch).eq("id", id);
    if (error) return mostrarErro(error);
    load();
  };

  const abrirFormaPag = (m: Mens) => {
    setPagMens(m);
    setFormaPagOpen(true);
  };
  // Multa de 10% + juros de 0,33% ao dia para parcelas vencidas
  const calcValorComJuros = (m: Mens | null): number => {
    if (!m) return 0;
    const base = Number(m.valor) || 0;
    if (m.status === "pago") return base;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(m.vencimento + "T00:00:00");
    const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
    if (diasAtraso <= 0) return base;
    return base * 1.1 + base * 0.0033 * diasAtraso;
  };
  const pagValorFinal = calcValorComJuros(pagMens);
  // Taxa de adesão embutida apenas na 1ª parcela (0 nas demais). Não sofre juros.
  const pagTaxaAdesao = pagMens ? Number(pagMens.taxa_adesao ?? 0) || 0 : 0;
  const pagTotalCobrar = pagValorFinal + pagTaxaAdesao;
  const pagDiasAtraso = pagMens
    ? Math.max(
        0,
        Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(pagMens.vencimento + "T00:00:00").getTime()) / 86400000),
      )
    : 0;
  // Normaliza para os valores aceitos pelo LancamentoDialog (igual à Agenda)
  const normalizarForma = (f: string) => (f === "credito" ? "cartao_credito" : f === "debito" ? "cartao_debito" : f);

  const escolherForma = (forma: string) => {
    if (!pagMens) return;
    setPagInitialForma(normalizarForma(forma));
    setFormaPagOpen(false);
    setLancOpen(true);
  };
  const escolherMisto = () => {
    setPagInitialForma("__misto__");
    setFormaPagOpen(false);
    setLancOpen(true);
  };

  // Atalhos 1–6 dentro do diálogo de forma de pagamento
  useEffect(() => {
    if (!formaPagOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!Number.isFinite(n)) return;
      if (n >= 1 && n <= formaOpcoes.length) {
        e.preventDefault();
        escolherForma(formaOpcoes[n - 1].forma);
      } else if (n === formaOpcoes.length + 1) {
        e.preventDefault();
        escolherMisto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [formaPagOpen, pagMens?.id]);

  const copiarLink = async () => {
    const url = `${window.location.origin}/p/contrato/${contrato.token_publico}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link de assinatura copiado");
  };

  const mensalidades = mens.filter((m) => !isAdesao(m));
  const pagas = mensalidades.filter((m) => m.status === "pago").length;
  const totalPagoMens = mens.filter((m) => m.status === "pago").reduce((s, m) => s + Number(m.valor), 0);
  const totalPago = totalPagoMens + extraRecebido.total;
  const pagasTotal = pagas + extraRecebido.count;
  const totalParcelas = mensalidades.length + extraRecebido.count;
  const aReceber = mens.filter((m) => m.status !== "pago").reduce((s, m) => s + Number(m.valor), 0);

  // ---- Dados da venda (aba "Dados") ----
  const totalVidasAtual = 1 + deps.filter((d) => d.ativo).length;
  const faixasElegiveis = faixas.filter(
    (f) => totalVidasAtual >= f.vidas_de && (f.vidas_ate == null || totalVidasAtual <= f.vidas_ate),
  );
  const faixaAtual = faixasElegiveis.length
    ? faixasElegiveis.reduce((a, b) => (b.vidas_de > a.vidas_de ? b : a))
    : null;
  const faixaLabel = faixaAtual
    ? (faixaAtual.vidas_ate == null
        ? `${faixaAtual.vidas_de}+ pessoas`
        : faixaAtual.vidas_ate === faixaAtual.vidas_de
          ? `${faixaAtual.vidas_de} ${faixaAtual.vidas_de === 1 ? "pessoa" : "pessoas"}`
          : `${faixaAtual.vidas_de} a ${faixaAtual.vidas_ate} pessoas`) + ` — ${BRL(Number(faixaAtual.valor_mensal))}`
    : "—";
  const formaLabelMap: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    debito: "Cartão de Débito",
    credito: "Cartão de Crédito",
    boleto: "Boleto",
    carne: "Carnê interno",
    manual: "Manual",
  };
  const formaLabel = formaLabelMap[contrato.forma_pagamento ?? ""] ?? contrato.forma_pagamento ?? "—";
  const maxDep = Number(convenio?.max_dependentes ?? 0) || 0;
  const depsAtivos = deps.filter((d) => d.ativo);

  const renderTermo = (dep: Dep, movimento: "Inclusão" | "Exclusão"): string => {
    const tpl = convenio?.termo_inclusao_html ?? "";
    if (!tpl) return "";
    const _cl = clinica ?? {};
    const _pa = pacienteFull ?? {};
    const enderecoPaciente = [
      _pa.logradouro,
      _pa.numero,
      _pa.bairro,
      _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade,
    ]
      .filter(Boolean)
      .join(", ");
    const dataMov = movimento === "Inclusão" ? dep.incluido_em : dep.excluido_em;
    const vars: Record<string, string> = {
      CLINICA_NOME: _cl.nome ?? "",
      CLINICA_CNPJ: _cl.cnpj ?? "",
      CLINICA_ENDERECO: [_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(", "),
      CIDADE: _cl.cidade ?? "",
      CONTRATO_NUMERO: String(contrato.numero),
      PACIENTE_NOME: contrato.paciente_nome ?? "",
      PACIENTE_CPF: _pa.cpf ?? "",
      PACIENTE_NASCIMENTO: fmtD(_pa.data_nascimento),
      PACIENTE_ENDERECO: enderecoPaciente,
      PACIENTE_TELEFONE: _pa.telefone ?? "",
      PACIENTE_EMAIL: _pa.email ?? "",
      VALOR_MENSAL: BRL(Number(contrato.valor_mensal)),
      TAXA_ADESAO: BRL(Number((contrato as any).taxa_adesao ?? 0)),
      DATA_HOJE: fmtDataExtenso(new Date().toISOString()),
      DEPENDENTE_NOME: dep.paciente_nome,
      DEPENDENTE_PARENTESCO: dep.parentesco ?? "",
      DEPENDENTE_CPF: dep.cpf ?? "",
      DEPENDENTE_TIPO: dep.tipo,
      TIPO_MOVIMENTO: movimento,
      DATA_MOVIMENTO: fmtDataExtenso(dataMov ?? new Date().toISOString().slice(0, 10)),
    };
    let out = tpl.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m: string, key: string, body: string) =>
      vars[key] && String(vars[key]).trim() ? body : "",
    );
    out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m: string, key: string, body: string) =>
      vars[key] && String(vars[key]).trim() ? "" : body,
    );
    return out.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] ?? "");
  };

  const printTermoInclusao = () => {
    if (!termoDep) return;
    const html = renderTermo(termoDep, termoMovimento);
    const safe = DOMPurify.sanitize(html);
    const titulo = `Termo de ${termoMovimento} — Contrato #${contrato.numero}`;
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color:#000; line-height: 1.45; }
h1, h2, h3 { margin: 0 0 6mm; }
.head { text-align:center; margin-bottom: 6mm; font-size: 10pt; }
.sig { margin-top: 14mm; display:flex; justify-content: space-around; gap:10mm; text-align:center; font-size: 10pt; }
.sig div { width:45%; }
</style></head><body>
<div class="head"><strong>${esc(clinica?.nome ?? "")}</strong><br/>${esc([clinica?.endereco, clinica?.cidade, clinica?.estado].filter(Boolean).join(" — "))}<br/>CNPJ: ${esc(clinica?.cnpj ?? "")}</div>
<div>${safe}</div>
<div class="sig">
  <div>____________________________<br/>${esc(clinica?.nome ?? "")}</div>
  <div>____________________________<br/>${esc(contrato.paciente_nome)}</div>
</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();},300);};</script>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Bloqueador de pop-up impediu a impressão");
      return;
    }
    w.document.open();
    w.document.write(doc);
    w.document.close();
  };

  const abrirTermoSeAssinado = (dep: Dep, movimento: "Inclusão" | "Exclusão") => {
    if (!contrato.assinado_em) return;
    if (!convenio?.termo_inclusao_html) {
      toast.message("Contrato assinado, mas o convênio não possui Termo de Inclusão cadastrado.");
      return;
    }
    setTermoDep(dep);
    setTermoMovimento(movimento);
    setTermoOpen(true);
  };

  // Recalcula o valor das parcelas em aberto conforme a faixa de vidas do convênio
  const recalcularParcelasAbertas = async (totalVidas: number) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!faixas.length) return;
    const elegiveis = faixas.filter(
      (fx) => totalVidas >= fx.vidas_de && (fx.vidas_ate == null || totalVidas <= fx.vidas_ate),
    );
    const f = elegiveis.length ? elegiveis.reduce((a, b) => (b.vidas_de > a.vidas_de ? b : a)) : null;
    if (!f) return;
    const novoValor = Number(f.valor_mensal);
    if (novoValor !== Number(valorMensalAtual)) {
      await supabase.from("contratos_assinatura").update({ valor_mensal: novoValor }).eq("id", contrato.id);
      setValorMensalAtual(novoValor);
      // Reflete imediatamente no objeto recebido por prop, para textos derivados
      (contrato as any).valor_mensal = novoValor;
    }
    const abertas = mens.filter((m) => !isAdesao(m) && m.status !== "pago");
    if (abertas.length === 0) return;
    await Promise.all(
      abertas.map((m) => {
        const isBoleto = (m.forma_pagamento ?? contrato.forma_pagamento) === "boleto";
        const v = novoValor + (isBoleto ? TAXA_BOLETO : 0);
        return supabase.from("contrato_mensalidades").update({ valor: v }).eq("id", m.id);
      }),
    );
    toast.success(`Parcelas em aberto recalculadas para ${BRL(novoValor)}/mês (${totalVidas} vidas)`);
  };

  const confirmarIncluir = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!incPaciente) {
      toast.error("Selecione um paciente");
      return;
    }
    if (depsAtivos.length >= maxDep) {
      toast.error(
        maxDep === 0 ? "Este convênio não permite dependentes." : `Limite de ${maxDep} dependentes atingido.`,
      );
      return;
    }
    if (depsAtivos.find((d) => d.paciente_id === incPaciente.id)) {
      toast.error("Esse paciente já é dependente ativo deste contrato");
      return;
    }
    if (incPaciente.id === (contrato as any).paciente_id) {
      toast.error("O titular não pode ser dependente");
      return;
    }
    setIncSaving(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("contrato_dependentes")
      .insert({
        contrato_id: contrato.id,
        paciente_id: incPaciente.id,
        paciente_nome: incPaciente.nome,
        parentesco: incParentesco || null,
        tipo: incTipo,
        incluido_em: hoje,
        ativo: true,
      })
      .select("id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, excluido_em, ativo")
      .maybeSingle();
    setIncSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Dependente incluído");
    setIncOpen(false);
    const novoDep: Dep = {
      id: data!.id,
      paciente_id: data!.paciente_id,
      paciente_nome: data!.paciente_nome,
      parentesco: data!.parentesco,
      tipo: data!.tipo,
      cpf: incPaciente.cpf,
      incluido_em: data!.incluido_em,
      excluido_em: data!.excluido_em,
      ativo: !!data!.ativo,
    };
    setIncPaciente(null);
    setIncParentesco("");
    setIncTipo("dependente");
    // Recalcula valor das parcelas em aberto conforme a nova quantidade de vidas
    // (titular + dependentes ativos, incluindo o recém-incluído)
    await recalcularParcelasAbertas(depsAtivos.length + 2);
    await load();
    abrirTermoSeAssinado(novoDep, "Inclusão");
  };

  const confirmarExcluir = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!excAlvo) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("contrato_dependentes")
      .update({ ativo: false, excluido_em: hoje })
      .eq("id", excAlvo.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Dependente excluído");
    const alvo = { ...excAlvo, ativo: false, excluido_em: hoje };
    setExcAlvo(null);
    // Recalcula valor das parcelas em aberto conforme nova qtd de vidas
    // (titular = 1 + dependentes ativos restantes = depsAtivos.length - 1)
    await recalcularParcelasAbertas(1 + Math.max(0, depsAtivos.length - 1));
    await load();
    abrirTermoSeAssinado(alvo, "Exclusão");
  };

  const contratoTexto = useMemo(() => {
    const tpl = convenio?.modelo_contrato ?? "";
    if (!tpl) return "";
    const _cl = clinica ?? {};
    const _pa = pacienteFull ?? {};
    const dependentesTxt = deps.length
      ? deps.map((d, i) => `${i + 1}. ${d.paciente_nome} — ${d.parentesco ?? "—"} (${d.tipo})`).join("\n")
      : "(nenhum)";
    const enderecoPaciente = [
      _pa.logradouro,
      _pa.numero,
      _pa.bairro,
      _pa.cidade && _pa.estado ? `${_pa.cidade}-${_pa.estado}` : _pa.cidade,
    ]
      .filter(Boolean)
      .join(", ");
    const maxSlots = Math.max(Number(convenio?.max_dependentes ?? 0) || 0, deps.length);
    const depSlotVars: Record<string, string> = {};
    for (let i = 0; i < maxSlots; i++) {
      const d = deps[i];
      const idx = i + 1;
      depSlotVars[`DEPENDENTE_${idx}`] = d?.paciente_nome ?? "";
      depSlotVars[`DEPENDENTE_${idx}_PARENTESCO`] = d?.parentesco ?? "";
      depSlotVars[`DEPENDENTE_${idx}_CPF`] = d?.cpf ?? "";
    }
    const vars: Record<string, string> = {
      CLINICA_NOME: _cl.nome ?? "",
      CLINICA_CNPJ: _cl.cnpj ?? "",
      CLINICA_ENDERECO: [_cl.endereco, _cl.cidade, _cl.estado].filter(Boolean).join(", "),
      CIDADE: _cl.cidade ?? "",
      PACIENTE_NOME: contrato.paciente_nome ?? "",
      PACIENTE_CPF: _pa.cpf ?? "",
      PACIENTE_NASCIMENTO: fmtD(_pa.data_nascimento),
      PACIENTE_ENDERECO: enderecoPaciente,
      PACIENTE_TELEFONE: _pa.telefone ?? "",
      PACIENTE_EMAIL: _pa.email ?? "",
      VALOR_MENSAL: BRL(Number(contrato.valor_mensal)),
      TAXA_ADESAO: BRL(Number((contrato as any).taxa_adesao ?? 0)),
      NUM_PARCELAS: String((contrato as any).num_parcelas ?? mens.length),
      VIGENCIA_MESES: String(convenio?.vigencia_meses ?? 12),
      FIDELIDADE_MESES: String(convenio?.fidelidade_meses ?? 0),
      DATA_HOJE: fmtDataExtenso(new Date().toISOString()),
      DEPENDENTES: dependentesTxt,
      ...depSlotVars,
    };
    return tpl.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => vars[k] ?? "");
  }, [convenio, clinica, pacienteFull, deps, mens.length, contrato]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-2xl font-bold">
          Contrato #{contrato.numero} — {contrato.paciente_nome}
        </h1>
        <div>
          {!cancelado && podeEscrever ? (
            <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
              <Ban className="h-4 w-4 mr-1" /> Cancelar contrato
            </Button>
          ) : (
            <div className="w-[160px]" />
          )}
        </div>
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <Tabs defaultValue={initialTab}>
            <TabsList>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="contrato">Contrato</TabsTrigger>
            </TabsList>
            <TabsContent value="resumo" className="space-y-4 mt-4">
              {cancelado ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2">
                  <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold text-destructive">
                      Contrato Cancelado em{" "}
                      {new Date(canceladoEm!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                    {cancelMotivoAtual ? (
                      <div className="text-muted-foreground mt-0.5">Motivo: {cancelMotivoAtual}</div>
                    ) : null}
                    <div className="text-muted-foreground mt-0.5">O plano e todos os benefícios foram cancelados.</div>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setDrill("pagas")}
                  className="rounded-md border p-3 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="text-muted-foreground text-xs">Pagas</div>
                  <div className="font-bold text-lg">
                    {pagasTotal}/{totalParcelas}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDrill("recebido")}
                  className="rounded-md border p-3 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="text-muted-foreground text-xs">Recebido</div>
                  <div className="font-bold text-lg text-green-600">{BRL(totalPago)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDrill("areceber")}
                  className="rounded-md border p-3 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="text-muted-foreground text-xs">A receber</div>
                  <div className="font-bold text-lg text-orange-600">{BRL(aReceber)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</div>
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={() => printContrato(contrato.id)}>
                  <Printer className="h-4 w-4 mr-1" />
                  Imprimir A4
                </Button>
                <Button size="sm" variant="secondary" onClick={() => printCartoes(contrato.id)}>
                  <CreditCard className="h-4 w-4 mr-1" />
                  Imprimir cartão{deps.length > 0 ? `(${deps.length + 1})` : ""}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await gerarCarnePDF(contrato.id);
                    } catch (e) {
                      mostrarErro(e);
                    }
                  }}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Gerar carnê (parcelas em aberto)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = await gerarBoletosFn({ data: { contratoId: contrato.id } });
                      if (res.erro) toast.error(res.mensagem);
                      else toast.info(res.mensagem);
                    } catch (e) {
                      mostrarErro(e);
                    }
                  }}
                >
                  <Barcode className="h-4 w-4 mr-1" />
                  Gerar boletos (parcelas em aberto)
                </Button>
                <Button size="sm" variant="outline" onClick={copiarLink}>
                  <Link2 className="h-4 w-4 mr-1" />
                  Link de assinatura
                </Button>
                {contrato.assinado_em ? (
                  <Badge variant="default">
                    <Check className="h-3 w-3 mr-1" />
                    Assinado em {fmtD(contrato.assinado_em)}
                  </Badge>
                ) : (
                  <Badge variant="outline">Aguardando assinatura</Badge>
                )}
              </div>

              {contrato.tabela_legada ? (
                <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-100">
                  <strong>Atenção:</strong> este contrato está na tabela <strong>antiga</strong> do Cartão Consulta.
                  Avisar o titular e migrar para a tabela atual a partir de{" "}
                  <strong>{contrato.migrar_apos ? fmtD(contrato.migrar_apos) : "01/07/2026"}</strong>.
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm">Mensalidades</h3>
                  {isAdmin && podeEscrever ? (
                    <Button size="sm" variant="outline" onClick={adicionarParcela}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar parcela
                    </Button>
                  ) : null}
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cobrança</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pago em</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                            Carregando…
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {mens.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            {isAdesao(m) ? (
                              <Badge variant="secondary">Adesão</Badge>
                            ) : (
                              m.numero_parcela
                            )}
                          </TableCell>
                          <TableCell>
                            {isAdmin && podeEscrever ? (
                              <Input
                                type="date"
                                className="h-8 w-40"
                                defaultValue={m.vencimento}
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  if (v && v !== m.vencimento) atualizarParcela(m.id, { vencimento: v });
                                }}
                              />
                            ) : (
                              fmtD(m.vencimento)
                            )}
                          </TableCell>
                          <TableCell>
                            {isAdmin && podeEscrever ? (
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                className="h-8 w-28"
                                defaultValue={Number(m.valor ?? 0).toFixed(2)}
                                onBlur={(e) => {
                                  const v = Number(String(e.target.value).replace(",", "."));
                                  if (Number.isFinite(v) && v !== Number(m.valor)) atualizarParcela(m.id, { valor: v });
                                }}
                              />
                            ) : (
                              BRL(m.valor)
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                m.status === "pago"
                                  ? "default"
                                  : isAtrasado(m.vencimento)
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {m.status === "pago"
                                ? "Pago"
                                : isAtrasado(m.vencimento)
                                  ? "Atrasado"
                                  : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell>{fmtD(m.pago_em)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              {podeEscrever && (m.status === "pago" ? (
                                <Button size="sm" variant="outline" onClick={() => marcarPago(m.id, false)}>
                                  Reverter
                                </Button>
                              ) : (
                                <Button size="sm" disabled={cancelado && !isAdmin} onClick={() => abrirFormaPag(m)}>
                                  <Check className="h-3 w-3 mr-1" />
                                  Pagar
                                </Button>
                              ))}
                              {isAdmin && podeEscrever ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Excluir parcela"
                                  onClick={() => excluirParcela(m.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="dados" className="mt-4 space-y-4">
              {isAdmin && podeEscrever ? (
                <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
                  Modo administrador — você pode alterar todos os campos deste contrato. Alterações não regeram parcelas
                  automaticamente; use a opção “Regerar 12 parcelas futuras” abaixo quando quiser propagar o novo valor.
                </div>
              ) : null}
              {isAdmin && podeEscrever ? (
                <div className="space-y-1">
                  <Label>Convênio</Label>
                  <Select value={admConvenioId} onValueChange={setAdmConvenioId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o convênio" />
                    </SelectTrigger>
                    <SelectContent>
                      {conveniosAdm.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <DadosField label="Convênio" value={convenio?.nome ?? "—"} />
              )}
              {isAdmin && podeEscrever && faixas.length > 0 ? (
                <div className="space-y-1">
                  <Label>Nº de pessoas no contrato</Label>
                  <Select value={admFaixaId} onValueChange={setAdmFaixaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a faixa…" />
                    </SelectTrigger>
                    <SelectContent>
                      {faixas.map((f) => {
                        const range =
                          f.vidas_ate == null
                            ? `${f.vidas_de}+ pessoas`
                            : f.vidas_ate === f.vidas_de
                              ? `${f.vidas_de} ${f.vidas_de === 1 ? "pessoa" : "pessoas"}`
                              : `${f.vidas_de} a ${f.vidas_ate} pessoas`;
                        return (
                          <SelectItem key={f.id} value={f.id}>
                            {range} — {BRL(Number(f.valor_mensal))}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Ao salvar, o valor mensal do contrato e das parcelas em aberto serão atualizados para a faixa selecionada.
                  </p>
                </div>
              ) : (
                <DadosField label="Nº de pessoas no contrato" value={faixaLabel} />
              )}
              {isAdmin && podeEscrever ? (
                <div className="space-y-1">
                  <Label>Paciente titular</Label>
                  <PatientSearchInput
                    value={admPaciente}
                    onSelect={(p) => setAdmPaciente(p)}
                    placeholder="Buscar paciente por nome ou CPF…"
                  />
                </div>
              ) : (
                <DadosField
                  label="Paciente titular"
                  value={`${contrato.paciente_nome}${pacienteFull?.cpf ? ` — CPF ${pacienteFull.cpf}` : ""}`}
                />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isAdmin && podeEscrever ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Data início</div>
                    <Input
                      type="date"
                      value={admDataInicio}
                      onChange={(e) => setAdmDataInicio(e.target.value)}
                    />
                  </div>
                ) : (
                  <DadosField label="Data início" value={fmtD(contrato.data_inicio)} />
                )}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Dia de vencimento</div>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={editDia}
                    onChange={(e) => setEditDia(e.target.value)}
                    disabled={(cancelado && !isAdmin) || savingDados || !podeEscrever}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Valor mensal (R$)</div>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editValor}
                    onChange={(e) => setEditValor(e.target.value)}
                    disabled={(cancelado && !isAdmin) || savingDados || !podeEscrever}
                  />
                </div>
                {isAdmin && podeEscrever ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Taxa de adesão (R$)</div>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={admTaxaAdesao}
                      onChange={(e) => setAdmTaxaAdesao(e.target.value)}
                    />
                  </div>
                ) : (
                  <DadosField label="Taxa de adesão" value={BRL(Number(contrato.taxa_adesao ?? 0))} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={regerarFuturas}
                    onChange={(e) => setRegerarFuturas(e.target.checked)}
                  />
                  Regerar 12 parcelas futuras com este valor e dia
                </label>
                <Button
                  size="sm"
                  onClick={salvarDadosFinanceiros}
                  disabled={(cancelado && !isAdmin) || savingDados || !podeEscrever}
                  className="ml-auto"
                >
                  {savingDados ? "Salvando…" : "Salvar valor e vencimento"}
                </Button>
              </div>
              {isAdmin && podeEscrever ? (
                <div className="space-y-1">
                  <Label>Forma de pagamento</Label>
                  <Select value={admForma || "__none__"} onValueChange={(v) => setAdmForma(v === "__none__" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a forma de pagamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não definido</SelectItem>
                      {formaOpcoes.map((f) => (
                        <SelectItem key={f.forma} value={f.forma}>
                          {f.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="carne">Carnê interno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <DadosField label="Forma de pagamento" value={formaLabel} />
              )}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    Dependentes ({depsAtivos.length}/{maxDep})
                  </div>
                  <div className="flex items-center gap-2">
                    {podeEscrever && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await recalcularParcelasAbertas(totalVidasAtual);
                          await load();
                        }}
                        disabled={cancelado}
                        title="Recalcula o valor mensal das parcelas em aberto conforme a quantidade atual de vidas (titular + dependentes ativos)"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" /> Atualizar contrato
                      </Button>
                    )}
                    {podeEscrever && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIncOpen(true)}
                        disabled={cancelado || maxDep === 0 || depsAtivos.length >= maxDep}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Incluir dependente
                      </Button>
                    )}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {deps.length === 0 ? (
                    "Nenhum dependente"
                  ) : (
                    <ul className="space-y-1">
                      {deps.map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-2">
                          <div className={d.ativo ? "" : "text-muted-foreground line-through"}>
                            • {d.paciente_nome}
                            <span className="text-muted-foreground no-underline">
                              {" "}
                              — {d.parentesco ?? "—"} ({d.tipo}){d.cpf ? ` — CPF ${d.cpf}` : ""}
                            </span>
                            <span className="text-muted-foreground no-underline">
                              {" "}
                              — Incluído: {fmtD(d.incluido_em)}
                            </span>
                            {d.excluido_em ? (
                              <span className="text-destructive no-underline"> — Excluído: {fmtD(d.excluido_em)}</span>
                            ) : null}
                          </div>
                          {d.ativo && podeEscrever ? (
                            <Button size="sm" variant="ghost" disabled={cancelado} onClick={() => setExcAlvo(d)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {isAdmin && podeEscrever ? (
                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea
                    rows={3}
                    value={admObs}
                    onChange={(e) => setAdmObs(e.target.value)}
                    placeholder="Observações internas do contrato"
                  />
                </div>
              ) : contrato.observacoes ? (
                <DadosField label="Observações" value={contrato.observacoes} />
              ) : null}
              {isAdmin && podeEscrever ? (
                <div className="flex justify-end pt-2">
                  <Button onClick={salvarContratoAdmin} disabled={savingAdm}>
                    {savingAdm ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando…
                      </>
                    ) : (
                      "Salvar alterações do contrato"
                    )}
                  </Button>
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="contrato" className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">
                  {convenio?.nome ? `Modelo do convênio: ${convenio.nome}` : "Modelo do contrato"}
                </div>
                <Button size="sm" onClick={() => printContrato(contrato.id)}>
                  <Printer className="h-4 w-4 mr-1" />
                  Imprimir A4
                </Button>
              </div>
              {contratoTexto ? (
                /<[a-z][\s\S]*>/i.test(contratoTexto) ? (
                  <div
                    className="prose prose-sm max-w-none p-4 rounded-md border bg-card"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contratoTexto) }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed p-4 rounded-md border bg-card">
                    {contratoTexto}
                  </pre>
                )
              ) : (
                <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Nenhum modelo cadastrado neste convênio. Configure em{" "}
                  <strong>Cartão de Benefícios → Convênios</strong>.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {drill === "pagas" && `Parcelas pagas — ${pagasTotal} de ${totalParcelas}`}
              {drill === "recebido" && `Recebido — ${BRL(totalPago)}`}
              {drill === "areceber" && `A receber — ${BRL(aReceber)}`}
            </DialogTitle>
            <DialogDescription>
              {drill === "areceber" ? "Parcelas em aberto deste contrato." : "Demonstrativo detalhado das parcelas."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const list =
                    drill === "areceber"
                      ? mens.filter((m) => m.status !== "pago")
                      : drill === "pagas" || drill === "recebido"
                        ? mens.filter((m) => m.status === "pago")
                        : mens;
                  if (list.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          Nenhum lançamento.
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return list.map((m, i) => (
                    <TableRow key={m.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{fmtD(m.vencimento)}</TableCell>
                      <TableCell>{BRL(Number(m.valor))}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.status === "pago"
                              ? "default"
                              : isAtrasado(m.vencimento)
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {m.status === "pago" ? "Pago" : isAtrasado(m.vencimento) ? "Atrasado" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell>{m.pago_em ? fmtD(m.pago_em) : "—"}</TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </div>
          {(drill === "recebido" || drill === "pagas") && extraRecebido.count > 0 ? (
            <div className="text-xs text-muted-foreground">
              + {extraRecebido.count} recebimento(s) avulso(s) totalizando {BRL(extraRecebido.total)}.
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrill(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formaPagOpen} onOpenChange={setFormaPagOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forma de pagamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            {contrato.paciente_nome} — Contrato #{contrato.numero}
            {pagMens ? ` · ${cobrancaLabel(pagMens)}${isAdesao(pagMens) ? "" : `/${mensalidades.length}`}` : ""}
            <span className="block text-xs mt-1 opacity-70">
              Dica: use as teclas 1–{formaOpcoes.length + 1} para escolher rapidamente.
            </span>
          </p>
          {pagMens && pagTaxaAdesao > 0 ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span>Mensalidade</span>
                <span>{BRL(pagValorFinal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Taxa de adesão</span>
                <span>{BRL(pagTaxaAdesao)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t border-primary/30">
                <span>Total a cobrar</span>
                <span>{BRL(pagTotalCobrar)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1">
                Serão emitidas 2 GRs separadas (mensalidade e taxa de adesão) e 2 lançamentos financeiros distintos.
              </div>
            </div>
          ) : null}
          {pagMens && pagDiasAtraso > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span>Valor original</span>
                <span>{BRL(Number(pagMens.valor))}</span>
              </div>
              <div className="flex justify-between">
                <span>Multa (10%)</span>
                <span>{BRL(Number(pagMens.valor) * 0.1)}</span>
              </div>
              <div className="flex justify-between">
                <span>Juros (0,33%/dia × {pagDiasAtraso}d)</span>
                <span>{BRL(Number(pagMens.valor) * 0.0033 * pagDiasAtraso)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t border-destructive/30">
                <span>Total com encargos</span>
                <span>{BRL(pagValorFinal)}</span>
              </div>
            </div>
          ) : null}
          <div className="grid gap-2 mt-2">
            {formaOpcoes.map((op, idx) => (
              <Button
                key={op.forma}
                variant="outline"
                className="justify-between h-12"
                onClick={() => escolherForma(op.forma)}
              >
                <span className="flex items-center gap-2">
                  <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border bg-muted text-xs font-mono">
                    {idx + 1}
                  </kbd>
                  {op.label}
                </span>
                <span className="font-semibold">{BRL(pagTotalCobrar)}</span>
              </Button>
            ))}
            <Button variant="default" className="justify-center h-12 mt-1 bg-primary" onClick={escolherMisto}>
              <kbd className="inline-flex h-6 w-6 items-center justify-center rounded border border-primary-foreground/40 bg-primary-foreground/10 text-xs font-mono mr-2">
                {formaOpcoes.length + 1}
              </kbd>
              💰 Mais de uma forma de pagamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LancamentoDialog
        open={lancOpen}
        onOpenChange={(v) => {
          setLancOpen(v);
          if (!v) {
            setPagMens(null);
            setPagInitialForma("");
          }
        }}
        tipo="receita"
        initialDescricao={
          pagMens
            ? `${isAdesao(pagMens) ? "Taxa de adesao" : `Mensalidade ${pagMens.numero_parcela}/${mensalidades.length}`} - Contrato #${contrato.numero} - ${contrato.paciente_nome}`
            : ""
        }
        initialValor={pagMens ? pagValorFinal.toFixed(2) : ""}
        initialFormaPagamento={pagInitialForma}
        categoriaFixaNome={pagMens && isAdesao(pagMens) ? "ADESAO CARTAO CONSULTA" : "MENSALIDADE CARTAO CONSULTA"}
        onSavedWithData={async (dados) => {
          if (!pagMens || !clinicaAtual) return;
          const mensId = pagMens.id;
          const taxaAdesao = Number(pagMens.taxa_adesao ?? 0) || 0;
          await marcarPago(mensId, true, dados.forma_pagamento ?? "misto");
          try {
            // Se a parcela carrega a taxa de adesão (apenas a 1ª parcela),
            // gera um lançamento financeiro separado e imprime UMA GR única
            // combinando mensalidade + taxa (em vez de dois pop-ups).
            if (taxaAdesao > 0) {
              try {
                // 1) Busca categoria "TAXA DE ADESAO CARTAO" (seed feito na migration).
                const { data: catRow } = await supabase
                  .from("fin_categorias")
                  .select("id")
                  .eq("clinica_id", clinicaAtual.clinica_id)
                  .ilike("nome", "TAXA DE ADESAO CARTAO")
                  .eq("tipo", "receita")
                  .maybeSingle();
                const categoriaTaxaId = (catRow as { id: string } | null)?.id ?? null;

                // 2) Insere lançamento independente para a taxa de adesão,
                // com mesma forma de pagamento escolhida pelo operador.
                const hojeStr = new Date().toISOString().slice(0, 10);
                const { data: lancTaxa, error: errLanc } = await supabase
                  .from("fin_lancamentos")
                  .insert({
                    clinica_id: clinicaAtual.clinica_id,
                    tipo: "receita",
                    descricao: `Taxa de adesão — Contrato #${contrato.numero} — ${contrato.paciente_nome}`,
                    valor: taxaAdesao,
                    data: hojeStr,
                    categoria_id: categoriaTaxaId,
                    forma_pagamento: dados.forma_pagamento,
                    bandeira_cartao: dados.bandeira_cartao,
                    parcelas: dados.parcelas,
                    status: "confirmado",
                    paciente_id: (contrato as { paciente_id?: string | null }).paciente_id ?? null,
                    criado_por: user?.id ?? null,
                  } as never)
                  .select("id")
                  .single();
                if (errLanc) throw errLanc;

                // 3) Registra movimento no caixa (sessão aberta do usuário).
                if (user?.id) {
                  const { data: sess } = await supabase
                    .from("caixa_sessoes")
                    .select("id")
                    .eq("clinica_id", clinicaAtual.clinica_id)
                    .eq("user_id", user.id)
                    .eq("status", "aberto")
                    .order("aberto_em", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (sess?.id) {
                    await supabase.from("caixa_movimentos").insert({
                      sessao_id: sess.id,
                      clinica_id: clinicaAtual.clinica_id,
                      user_id: user.id,
                      tipo: "recebimento",
                      valor: taxaAdesao,
                      descricao: `Taxa de adesão — Contrato #${contrato.numero} — ${contrato.paciente_nome}`,
                      forma_pagamento: dados.forma_pagamento,
                      lancamento_id: (lancTaxa as { id: string } | null)?.id ?? null,
                    } as never);
                  }
                }

                // 4) Imprime UMA GR única com mensalidade + taxa de adesão.
                await printGuiaMensalidadeComTaxa({
                  mensalidadeId: mensId,
                  clinicaId: clinicaAtual.clinica_id,
                  valorTaxa: taxaAdesao,
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
                toast.success("Pagamento registrado. GR única (mensalidade + taxa de adesão) enviada para impressão.");
              } catch (err) {
                mostrarErro(err);
              }
            } else {
              await printGuiaMensalidade({
                mensalidadeId: mensId,
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
            }
          } catch (err) {
            mostrarErro(err);
          }
          setPagMens(null);
          setPagInitialForma("");
        }}
      />

      <Dialog open={incOpen} onOpenChange={setIncOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Incluir dependente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Paciente</Label>
              {incPaciente ? (
                <div className="flex items-center justify-between rounded-md border p-2 bg-muted/30">
                  <span className="font-medium text-sm">
                    {incPaciente.nome}
                    {incPaciente.cpf ? ` — ${incPaciente.cpf}` : ""}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setIncPaciente(null)}>
                    Trocar
                  </Button>
                </div>
              ) : (
                <PatientSearchInput
                  clinicaIdsOverride={[(contrato as any).clinica_id]}
                  placeholder="Buscar por nome, CPF, prontuário, pasta ou nascimento…"
                  onSelect={(p) => {
                    if (!p) return;
                    const titularId = (contrato as any).paciente_id as string | undefined;
                    if (p.id === titularId) {
                      toast.error("Este paciente é o titular do contrato.");
                      return;
                    }
                    if (depsAtivos.some((d) => d.paciente_id === p.id)) {
                      toast.error("Este paciente já é dependente ativo do contrato.");
                      return;
                    }
                    setIncPaciente(p);
                  }}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Parentesco</Label>
                <Select value={incParentesco} onValueChange={setIncParentesco}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Filho(a)">Filho(a)</SelectItem>
                    <SelectItem value="Cônjuge">Cônjuge</SelectItem>
                    <SelectItem value="Pai">Pai</SelectItem>
                    <SelectItem value="Mãe">Mãe</SelectItem>
                    <SelectItem value="Irmão(ã)">Irmão(ã)</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={incTipo} onValueChange={setIncTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dependente">Dependente</SelectItem>
                    <SelectItem value="agregado">Agregado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {contrato.assinado_em && convenio?.termo_inclusao_html ? (
              <p className="text-xs text-muted-foreground">
                Após incluir, será gerado o <strong>Termo de Inclusão</strong> para impressão/assinatura.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIncOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarIncluir} disabled={incSaving || !incPaciente || !podeEscrever}>
              {incSaving ? "Incluindo…" : "Incluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!excAlvo}
        onOpenChange={(v) => {
          if (!v) setExcAlvo(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir dependente</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Excluir <strong>{excAlvo?.paciente_nome}</strong> do contrato?
          </p>
          {contrato.assinado_em && convenio?.termo_inclusao_html ? (
            <p className="text-xs text-muted-foreground">
              Após excluir, será gerado o <strong>Termo de Exclusão</strong> para impressão/assinatura.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcAlvo(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExcluir} disabled={!podeEscrever}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={termoOpen} onOpenChange={setTermoOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Termo de {termoMovimento} — {termoDep?.paciente_nome}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-card p-4">
            {termoDep ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderTermo(termoDep, termoMovimento)) }}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTermoOpen(false)}>
              Fechar
            </Button>
            <Button onClick={printTermoInclusao}>
              <Printer className="h-4 w-4 mr-1" />
              Imprimir A4
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onOpenChange={(v) => {
          setCancelOpen(v);
          if (!v) setCancelMotivo("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar contrato</DialogTitle>
            <DialogDescription>
              Esta ação cancela o plano e todos os benefícios deste contrato. Informe o motivo do cancelamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-motivo">Motivo</Label>
            <Textarea
              id="cancel-motivo"
              rows={4}
              placeholder="Ex.: solicitado pelo titular, inadimplência, mudança de plano…"
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelSaving}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarCancelamento}
              disabled={cancelSaving || !cancelMotivo.trim() || !podeEscrever}
            >
              {cancelSaving ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!retroDialog?.open}
        onOpenChange={(o) => { if (!o && !regerandoRetro) setRetroDialog(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Data de início movida para o passado</DialogTitle>
            <DialogDescription>
              Já existem parcelas pagas nesse intervalo? Informe quantas para o sistema
              marcar como pagas e gerar apenas as restantes até completar 12 parcelas.
            </DialogDescription>
          </DialogHeader>
          {retroDialog && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Parcelas já pagas</Label>
                <Input
                  type="number"
                  min={0}
                  max={12}
                  value={retroDialog.parcelasPagas}
                  onChange={(e) => setRetroDialog({ ...retroDialog, parcelasPagas: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Serão geradas 12 parcelas a partir de {retroDialog.dataInicio.slice(8,10)}/{retroDialog.dataInicio.slice(5,7)}/{retroDialog.dataInicio.slice(0,4)}.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetroDialog(null)} disabled={regerandoRetro}>
              Cancelar
            </Button>
            <Button
              onClick={() => regerarComPagas(Number(retroDialog?.parcelasPagas ?? 0))}
              disabled={regerandoRetro || !podeEscrever}
            >
              {regerandoRetro ? "Gerando…" : "Confirmar e regenerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
