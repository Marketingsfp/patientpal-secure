import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Info,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { estornarLancamentoReceita } from "@/lib/estornar-lancamento";
import { incluirDependenteContrato } from "@/lib/contrato-dependentes";
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
import { RenovarContratoDialog } from "@/components/contratos/renovar-contrato-dialog";
import { HistoricoContratoTab } from "@/components/contratos/historico-contrato-tab";
import { emitirNfse, consultarNfse } from "@/lib/nfse.functions";
import { usePickTomador, aplicarValorParcial } from "@/components/nfse/use-pick-tomador";
import { usePromptDescricaoNfse } from "@/components/nfse/use-prompt-descricao";

import { DateInputBR } from "@/components/ui/date-input-br";
import { Checkbox } from "@/components/ui/checkbox";
const BRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtD = (s?: string | null) =>
  s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const competenciaDe = (s?: string | null): string => {
  if (!s) return "—";
  const [, m, ] = s.slice(0, 10).split("-").map(Number);
  if (!m || m < 1 || m > 12) return "—";
  return MESES_PT[m - 1];
};
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
  codigo_prontuario?: string | null;
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
  codigo_prontuario?: string | null;
  sem_carencia?: boolean | null;
  sem_carencia_motivo?: string | null;
  sem_carencia_por?: string | null;
  sem_carencia_em?: string | null;
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
  lancamento_id?: string | null;
  valor_pago?: number | null;
};

const isAdesao = (m: Pick<Mens, "numero_parcela">) => Number(m.numero_parcela) === 0;

/** Taxa de inclusão de dependente: linha com numero_parcela negativo. */
const isTaxaInclusao = (m: Pick<Mens, "numero_parcela">) => Number(m.numero_parcela) < 0;
/** Encargo avulso: qualquer cobrança que NÃO seja uma mensalidade mensal.
 *  Cobre a linha de adesão inicial (numero_parcela = 0) e as taxas de
 *  inclusão de dependente (numero_parcela < 0). Todos os filtros que se
 *  referem a "parcelas mensais" (contador N/M, recálculo por vidas,
 *  renumeração) usam este predicado. */
const isEncargoAvulso = (m: Pick<Mens, "numero_parcela">) =>
  Number(m.numero_parcela) <= 0;

const cobrancaLabel = (m: Pick<Mens, "numero_parcela">) =>
  isAdesao(m)
    ? "Adesão"
    : isTaxaInclusao(m)
      ? "Taxa inclusão"
      : `Mensalidade ${m.numero_parcela}`;
type Dep = {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string;
  cpf?: string | null;
  codigo_prontuario?: string | null;
  incluido_em: string | null;
  excluido_em: string | null;
  ativo: boolean;
};

/** Badge compacta com o código de prontuário do paciente, para diferenciar
 *  homônimos ao lado do nome (titular/dependente). Omitida quando o paciente
 *  não tem código cadastrado. */
function ProntuarioBadge({ codigo }: { codigo?: string | null }) {
  if (!codigo) return null;
  return (
    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">
      Prontuário {codigo}
    </span>
  );
}

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

  // Fluxo "É renovação?" acionado antes de abrir a nova venda.
  const [perguntaRenovOpen, setPerguntaRenovOpen] = useState(false);
  const [escolhaContratoOpen, setEscolhaContratoOpen] = useState(false);
  const [pacRenov, setPacRenov] = useState<PatientOption | null>(null);
  const [contratosPac, setContratosPac] = useState<Contrato[]>([]);
  const [loadingContratosPac, setLoadingContratosPac] = useState(false);
  const [renovInfo, setRenovInfo] = useState<{
    contratoId: string;
    clinicaId: string;
    convenioId: string | null;
    convenioNome: string | null;
    valorMensal: number;
  } | null>(null);
  // "renovacao" (padrão) exige mensalidades pagas; "troca_convenio" cancela o
  // contrato atual e as mensalidades pendentes para criar um novo contrato sem
  // taxa de adesão nem carência.
  const [flowType, setFlowType] = useState<"renovacao" | "troca_convenio">("renovacao");

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
    const contratosRows = (cs.data ?? []) as Contrato[];
    // Enriquecer com codigo_prontuario do paciente titular (leitura, imutável).
    const pacIds = Array.from(
      new Set(contratosRows.map((c) => c.paciente_id).filter((x): x is string => !!x)),
    );
    let prontMap: Record<string, string | null> = {};
    if (pacIds.length > 0) {
      const { data: pacs } = await supabase
        .from("pacientes")
        .select("id, codigo_prontuario")
        .in("id", pacIds);
      prontMap = Object.fromEntries(
        ((pacs ?? []) as Array<{ id: string; codigo_prontuario: string | null }>).map(
          (p) => [p.id, p.codigo_prontuario],
        ),
      );
    }
    setList(
      contratosRows.map((c) => ({
        ...c,
        codigo_prontuario: c.paciente_id ? prontMap[c.paciente_id] ?? null : null,
      })),
    );
    setConvenios((cv.data ?? []) as Convenio[]);
    // Agregar parcelas dos contratos carregados
    const contratoIds = ((cs.data ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (contratoIds.length > 0) {
      // Buscar mensalidades em lotes de contratos para evitar o teto de 1000
      // linhas por request do PostgREST (ex.: 500 contratos × 12 parcelas
      // ≈ 6000 linhas retornariam truncadas, deixando contratos com "0/0").
      const hojeStr = new Date().toISOString().slice(0, 10);
      const agg: Record<string, { pagas: number; total: number; temAtrasada: boolean }> = {};
      for (const id of contratoIds) agg[id] = { pagas: 0, total: 0, temAtrasada: false };
      const LOTE = 60; // ~60 contratos × 12 parcelas = 720 linhas por lote
      for (let i = 0; i < contratoIds.length; i += LOTE) {
        const slice = contratoIds.slice(i, i + LOTE);
        const { data: mens } = await supabase
          .from("contrato_mensalidades")
          .select("contrato_id, status, vencimento, numero_parcela")
          .in("contrato_id", slice);
        // Agrupa por contrato para segmentar em ciclos de 12 parcelas
        // (renovações acrescentam parcelas 13..24, 25..36, etc.). A contagem
        // exibida é sempre do ciclo atual (últimas 12 parcelas), pois cada
        // contrato representa um período de 12 meses.
        const porContrato: Record<string, Array<{ status: string; vencimento: string; numero_parcela: number }>> = {};
        for (const m of (mens ?? []) as Array<{ contrato_id: string; status: string; vencimento: string; numero_parcela: number }>) {
          if (Number(m.numero_parcela) <= 0) continue; // ignora adesão/taxas
          (porContrato[m.contrato_id] ||= []).push(m);
        }
        for (const [cid, arr] of Object.entries(porContrato)) {
          const a = agg[cid];
          if (!a) continue;
          // Ciclo atual = as 12 parcelas com maior numero_parcela.
          arr.sort((x, y) => y.numero_parcela - x.numero_parcela);
          const cicloAtual = arr.slice(0, 12);
          a.total = cicloAtual.length;
          for (const m of cicloAtual) {
            if (m.status === "pago") a.pagas += 1;
            else if (m.vencimento && m.vencimento < hojeStr) a.temAtrasada = true;
          }
        }
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
          <Button onClick={() => setPerguntaRenovOpen(true)} disabled={convenios.length === 0}>
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
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          {filtered.length === 0 ? (
            <span>Nenhum contrato{temFiltroAtivo ? " com os filtros atuais" : ""}.</span>
          ) : temFiltroAtivo ? (
            <span>
              <strong className="text-foreground">{filtered.length}</strong> resultado{filtered.length === 1 ? "" : "s"}
              {" — filtros ativos: "}
              <span className="text-foreground">{filtrosAtivos.join(", ")}</span>
            </span>
          ) : (
            <span>
              Mostrando{" "}
              <strong className="text-foreground">
                {inicioIdx + 1}–{Math.min(inicioIdx + POR_PAGINA, filtered.length)}
              </strong>{" "}
              de <strong className="text-foreground">{filtered.length}</strong> contratos
            </span>
          )}
        </div>
        {temFiltroAtivo ? (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar filtros</Button>
        ) : null}
      </div>
      <div className="rounded-md border bg-card overflow-hidden">
        <Table className="max-lg:table max-lg:overflow-visible">
          <TableHeader className="sticky top-0 z-20">
            <TableRow className="bg-muted">
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
              <TableHead>
                <Select value={filtroConvenio} onValueChange={setFiltroConvenio}>
                  <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 font-bold uppercase tracking-wide text-xs text-primary shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none [&>svg]:opacity-60">
                    <span className="inline-flex items-center gap-1">
                      TIPO DE CONVÊNIO
                      {filtroConvenio !== "todos" ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sem">Sem convênio</SelectItem>
                    {convenios.map((cv) => (
                      <SelectItem key={cv.id} value={cv.id}>{cv.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
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
            {paginados.map((c) => {
              const agg = parcAgg[c.id];
              const emDia = !agg || !agg.temAtrasada;
              return (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetail(c)}>
                <TableCell className="font-semibold">{c.numero}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{c.paciente_nome}</span>
                    <ProntuarioBadge codigo={c.codigo_prontuario} />
                    {c.tabela_legada ? (
                      <Badge
                        variant="outline"
                        className="text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                      >
                        Tabela antiga — migrar {c.migrar_apos ? `em ${fmtD(c.migrar_apos)}` : ""}
                      </Badge>
                    ) : null}
                    {c.sem_carencia ? (
                      <Badge
                        variant="outline"
                        className="text-emerald-700 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                      >
                        Sem carência
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
        {filtered.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
            <span>
              {filtered.length} contrato{filtered.length === 1 ? "" : "s"}
              {filtered.length > POR_PAGINA ? (
                <> — exibindo {inicioIdx + 1}–{Math.min(inicioIdx + POR_PAGINA, filtered.length)}</>
              ) : null}
            </span>
            {totalPaginas > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paginaAtual <= 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="tabular-nums">
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Passo 1: pergunta "É renovação?" antes de abrir a nova venda */}
      <AlertDialog open={perguntaRenovOpen} onOpenChange={setPerguntaRenovOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Que tipo de operação você quer registrar?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Renovação</strong>: continua o convênio depois que todas as parcelas foram pagas.
              <br />
              <strong>Troca de convênio</strong>: o paciente desiste do convênio atual antes do fim do ciclo para aderir a outro — cancela o contrato atual e as mensalidades pendentes.
              <br />
              Em ambos os casos, não há cobrança de taxa de adesão e a carência não se aplica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row sm:justify-end gap-2">
            <AlertDialogCancel
              onClick={() => {
                setPerguntaRenovOpen(false);
                setView("new");
              }}
            >
              É venda nova
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setFlowType("troca_convenio");
                setPerguntaRenovOpen(false);
                setPacRenov(null);
                setContratosPac([]);
                setEscolhaContratoOpen(true);
              }}
            >
              Troca de convênio
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                setFlowType("renovacao");
                setPerguntaRenovOpen(false);
                setPacRenov(null);
                setContratosPac([]);
                setEscolhaContratoOpen(true);
              }}
            >
              Renovação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Passo 2: escolher o titular e o contrato a renovar ou trocar */}
      <Dialog open={escolhaContratoOpen} onOpenChange={setEscolhaContratoOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {flowType === "troca_convenio"
                ? "Selecionar contrato para troca de convênio"
                : "Selecionar contrato para renovação"}
            </DialogTitle>
            <DialogDescription>
              {flowType === "troca_convenio"
                ? "Busque o titular e escolha o contrato que será cancelado para a troca de convênio."
                : "Busque o paciente titular e escolha qual contrato será renovado."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Paciente titular</Label>
              <PatientSearchInput
                value={pacRenov}
                onSelect={async (p: PatientOption | null) => {
                  setPacRenov(p);
                  setContratosPac([]);
                  if (!p || !clinicaAtual) return;
                  setLoadingContratosPac(true);
                  const { data } = await supabase
                    .from("contratos_assinatura")
                    .select("*")
                    .eq("clinica_id", clinicaAtual.clinica_id)
                    .eq("paciente_id", p.id)
                    .order("data_inicio", { ascending: false });
                  const rows = ((data ?? []) as Contrato[]);
                  // Na troca de convênio, só contratos ativos podem ser trocados.
                  setContratosPac(
                    flowType === "troca_convenio"
                      ? rows.filter((c) => c.status === "ativo")
                      : rows,
                  );
                  setLoadingContratosPac(false);
                }}
              />
            </div>
            {pacRenov ? (
              loadingContratosPac ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando contratos…
                </div>
              ) : contratosPac.length === 0 ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  {flowType === "troca_convenio"
                    ? "Este paciente não possui contrato ativo — a troca de convênio só pode ser aplicada em contratos ativos."
                    : "Este paciente não possui contrato anterior. A venda seguirá como contrato novo (com taxa de adesão e carência normais)."}
                </div>
              ) : (
                <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
                  {contratosPac.map((c) => {
                    const conv = convenios.find((cv) => cv.id === c.convenio_id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center justify-between gap-3"
                        onClick={() => {
                          setRenovInfo({
                            contratoId: c.id,
                            clinicaId: c.clinica_id ?? clinicaAtual!.clinica_id,
                            convenioId: c.convenio_id ?? null,
                            convenioNome: conv?.nome ?? null,
                            valorMensal: Number(c.valor_mensal ?? 0),
                          });
                          setEscolhaContratoOpen(false);
                        }}
                      >
                        <div className="text-sm">
                          <div className="font-medium">#{c.numero} — {conv?.nome ?? "Convênio"}</div>
                          <div className="text-xs text-muted-foreground">
                            Início {fmtD(c.data_inicio)} · {BRL(Number(c.valor_mensal ?? 0))} · {c.status}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEscolhaContratoOpen(false);
                setView("new");
              }}
            >
              Cancelar e fazer venda nova
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passo 3: dialog de renovação (nunca cobra adesão) */}
      {renovInfo ? (
        <RenovarContratoDialog
          open={!!renovInfo}
          onOpenChange={(o) => { if (!o) setRenovInfo(null); }}
          contratoId={renovInfo.contratoId}
          clinicaId={renovInfo.clinicaId}
          convenioAtualId={renovInfo.convenioId}
          convenioAtualNome={renovInfo.convenioNome}
          valorAtual={renovInfo.valorMensal}
          modo={flowType}
          onRenovado={() => {
            setRenovInfo(null);
            load();
          }}
        />
      ) : null}
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
  const [titularApenasFinanceiro, setTitularApenasFinanceiro] = useState(false);
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
      .select("id, nome, cpf, telefone, email, face_descriptor, codigo_prontuario")
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
        codigo_prontuario: null,
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
    const vidasAtuais = (titular && !titularApenasFinanceiro ? 1 : 0) + deps.length;
    const inicial =
      faixas.find((f) => vidasAtuais >= f.vidas_de && (f.vidas_ate == null || vidasAtuais <= f.vidas_ate)) ?? faixas[0];
    setFaixaId(inicial.id);
    setValor(Number(inicial.valor_mensal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faixas, titularApenasFinanceiro]);

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
    const convenioMaxDep = Number(convenio.max_dependentes ?? 0) || 0;
    const faixaSel = faixaId ? faixas.find((f) => f.id === faixaId) : null;
    const titularOcupa = titularApenasFinanceiro ? 0 : 1;
    const maxDep =
      faixaSel && faixaSel.vidas_ate != null
        ? Math.max(0, Number(faixaSel.vidas_ate) - titularOcupa)
        : convenioMaxDep;
    if (deps.length > maxDep) {
      return toast.error(
        maxDep === 0
          ? "Este convênio não permite dependentes."
          : `Faixa selecionada permite no máximo ${maxDep} dependente(s).`,
      );
    }
    // Sanitiza observações (remove HTML/scripts) e aplica limite
    const obsClean = DOMPurify.sanitize(obs.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (obsClean.length > OBS_MAX) {
      return toast.error(`Observações: máximo ${OBS_MAX} caracteres.`);
    }
    setSaving(true);

    // Gerar cobrancas: taxa de adesao separada da mensalidade.
    const base = new Date(dataInicio + "T00:00:00");
    const valorParcela = valor + (tipoCobranca === "boleto" ? TAXA_BOLETO : 0);
    const parcelas = Array.from({ length: convenio.num_parcelas }, (_, i) => {
      const venc = new Date(base.getFullYear(), base.getMonth() + i, diaVenc);
      const jaPago = i < mensalidadesJaPagas;
      const vencStr = venc.toISOString().slice(0, 10);
      // Taxa de adesão só na 1ª parcela. Se o operador informou parcelas
      // "já pagas" (contrato retroativo), a taxa também já foi paga e vai zero.
      const taxaParcela = i === 0 && !jaPago ? Number(taxa || 0) : 0;
      return {
        numero_parcela: i + 1,
        vencimento: vencStr,
        valor: valorParcela,
        taxa_adesao: taxaParcela,
        status: jaPago ? "pago" : "pendente",
        ...(jaPago ? { pago_em: vencStr, valor_pago: valorParcela } : {}),
      };
    });
    const taxaAdesao = Number(taxa) || 0;
    // Taxa de adesão é registrada em contratos_assinatura.taxa_adesao e NÃO
    // gera uma linha em contrato_mensalidades — não é uma mensalidade.
    const cobrancas = parcelas;

    // Contrato + dependentes + mensalidades numa única transação (RPC):
    // se qualquer etapa falhar, o Postgres desfaz tudo — antes eram 3
    // inserts separados e uma falha no meio podia deixar contrato sem
    // parcelas ou sem dependentes.
    const { data: rpcData, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>)("criar_contrato_assinatura", {
      _clinica_id: clinicaId,
      _convenio_id: convenio.id,
      _paciente_id: titular.id,
      _paciente_nome: titular.nome,
      _data_inicio: dataInicio,
      _data_fim: addUmAno(dataInicio),
      _dia_vencimento: diaVenc,
      _valor_mensal: valor,
      _taxa_adesao: taxa,
      _num_parcelas: convenio.num_parcelas,
      _forma_pagamento: tipoCobranca ?? null,
      _observacoes: obsClean,
      _criado_por: userId,
      _dependentes: deps.map((d) => ({
        paciente_id: d.id,
        paciente_nome: d.nome,
        parentesco: d.parentesco || null,
        tipo: d.tipo,
      })),
      _mensalidades: cobrancas,
    });
    if (error) {
      setSaving(false);
      return mostrarErro(error);
    }
    const contrato = rpcData as { id: string; numero: number } | null;
    if (!contrato?.id) {
      setSaving(false);
      return toast.error("Falha ao criar contrato: retorno inesperado da função de banco.");
    }

    if (titularApenasFinanceiro) {
      await supabase
        .from("contratos_assinatura")
        .update({ titular_apenas_financeiro: true } as any)
        .eq("id", contrato.id);
    }

    setSaving(false);
    toast.success(`Contrato #${contrato.numero} criado com ${convenio.num_parcelas} mensalidades${taxaAdesao > 0 ? " + taxa de adesão" : ""}`);

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
            <div className="col-span-2">
              <Label>Paciente titular</Label>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] items-start">
                <div className="space-y-1 min-w-0">
                  {titular ? (
                    <>
                    <div className="flex items-center justify-between rounded-md border p-2 bg-muted/30">
                    <span className="font-medium flex items-center gap-2">
                      {titular.nome} {titular.cpf ? `— ${titular.cpf}` : ""}
                      <ProntuarioBadge codigo={titular.codigo_prontuario} />
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTitular(null);
                          setTitularApenasFinanceiro(false);
                        }}
                      >
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
                  </>
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
                <div
                  className={`flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 md:self-stretch md:min-w-[260px] md:max-w-[340px] ${!titular ? "opacity-60" : ""}`}
                >
                    <input
                      id="tit-apenas-fin-novo"
                      type="checkbox"
                      className="mt-0.5"
                      disabled={!titular}
                      checked={!!titular && titularApenasFinanceiro}
                      onChange={(e) => setTitularApenasFinanceiro(e.target.checked)}
                    />
                    <label
                      htmlFor="tit-apenas-fin-novo"
                      className={`text-sm ${titular ? "cursor-pointer" : "cursor-not-allowed text-muted-foreground"}`}
                    >
                      <span className="font-medium">Apenas titular financeiro</span>
                      <span className="text-muted-foreground"> — paga o plano, mas não usufrui dos benefícios.</span>
                      <span
                        className="ml-1 inline-flex items-center text-muted-foreground"
                        title="Marque quando o titular apenas paga o contrato e não usufrui dos benefícios. Ele NÃO conta na quantidade de vidas do plano e aparecerá na carteirinha com o selo 'Titular financeiro — Não utiliza os benefícios'."
                      >
                        <Info className="h-3.5 w-3.5" />
                      </span>
                      {!titular ? (
                        <span className="block text-xs text-muted-foreground mt-1">
                          Selecione o paciente titular para habilitar.
                        </span>
                      ) : null}
                    </label>
                  </div>
              </div>
            </div>
            {/* Linha 1: Convênio | Nº pessoas | Valor mensal | Taxa de adesão */}
            <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
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
            </div>

            {/* Linha 2: Data início | Data término | Dia de vencimento */}
            <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Data início</Label>
                <DateInputBR value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
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

            {/* ====== SEÇÃO DE DEPENDENTES ====== */}
<div className="col-span-2 border-t pt-3">
  {(() => {
    const faixaSel = faixaId ? faixas.find((f) => f.id === faixaId) : null;
    const titularOcupa = titularApenasFinanceiro ? 0 : 1;
    
    // 🔥 O número de dependentes É O vidas_de
    const maxDepWiz = Math.max(0, Number(faixaSel?.vidas_de ?? 0) - (titularApenasFinanceiro ? 1 : 0));
    
    const qtdAtual = deps.length;
    const podeAdicionar = qtdAtual < maxDepWiz;

    return (
      <>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">
            Dependentes {maxDepWiz > 0 ? `(${qtdAtual}/${maxDepWiz})` : '(nenhum permitido)'}
          </Label>
          {podeAdicionar && maxDepWiz > 0 && (
            <Button size="sm" variant="outline" onClick={() => setDepOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Adicionar
            </Button>
          )}
        </div>

        {podeAdicionar && maxDepWiz > 0 && (
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

        {deps.length > 0 && (
          <div className="mt-2 space-y-2">
            {deps.map((d, i) => (
              <div key={d.id || i} className="grid grid-cols-12 gap-2 items-center rounded-md border p-2 bg-muted/20">
                <span className="col-span-12 sm:col-span-4 text-sm truncate">
                  {d.nome}
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
        )}

        {qtdAtual === 0 && maxDepWiz > 0 && (
          <div className="mt-2 rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Este convênio permite até <strong>{maxDepWiz} dependente{maxDepWiz > 1 ? 's' : ''}</strong>.
            </p>
          </div>
        )}

        {qtdAtual >= maxDepWiz && maxDepWiz > 0 && (
          <div className="w-full mt-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            ✅ Limite de {maxDepWiz} dependente{maxDepWiz > 1 ? 's' : ''} atingido.
          </div>
        )}
      </>
    );
  })()}
</div>

            {/* ====== OBSERVAÇÕES ====== */}
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={obs}
                maxLength={OBS_MAX}
                onChange={(e) => setObs(e.target.value)}
              />
              <p className={`text-xs mt-1 text-right ${obsSanitizedLen > OBS_MAX ? "text-red-600" : "text-muted-foreground"}`}>
                {obsSanitizedLen} / {OBS_MAX} caracteres
              </p>
            </div>
          </div>

          {/* ====== BOTÕES ====== */}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={onBack}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={!podeSalvar || !podeEscrever}>
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
  const DadosField = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{value || "—"}</div>
    </div>
  );
  const ApenasFinanceiroToggle = ({
    contratoId: _cid,
    checked,
    saving,
    disabled,
    onChange,
  }: {
    contratoId: string;
    checked: boolean;
    saving: boolean;
    disabled?: boolean;
    onChange: (v: boolean) => Promise<void> | void;
  }) => (
    <div className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 mt-1">
      <input
        id={`tit-apenas-fin-${_cid}`}
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        disabled={saving || disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={`tit-apenas-fin-${_cid}`} className="text-sm cursor-pointer">
        <span className="font-medium">Apenas titular financeiro</span>
        <span className="text-muted-foreground"> — paga o plano, mas não usufrui dos benefícios.</span>
        <span
          className="ml-1 inline-flex items-center text-muted-foreground"
          title="Marque quando o titular apenas paga o contrato e não usufrui dos benefícios. Ele NÃO conta na quantidade de vidas do plano e aparecerá na carteirinha com o selo 'Titular financeiro — Não utiliza os benefícios'."
        >
          <Info className="h-3.5 w-3.5" />
        </span>
        {saving ? <span className="ml-2 text-xs text-muted-foreground">salvando…</span> : null}
      </label>
    </div>
  );
  const [mens, setMens] = useState<Mens[]>([]);
  // Rascunhos de edição da tabela Mensalidades (vencimento/valor/pago_em).
  // Só persistem no banco quando o usuário clica em "Salvar alterações".
  type RascunhoMens = { vencimento?: string; valor?: number; pago_em?: string | null };
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoMens>>({});
  const [salvandoRascunhos, setSalvandoRascunhos] = useState(false);
  // Seleção múltipla para marcar parcelas como "Paga (histórica)" em lote.
  // Não afeta o fluxo de "Pagar" com forma de pagamento (esse continua unitário).
  const [selectedHistIds, setSelectedHistIds] = useState<Set<string>>(new Set());
  const [aplicandoHistLote, setAplicandoHistLote] = useState(false);
  const toggleHistSel = (id: string) => {
    setSelectedHistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const limparHistSel = () => setSelectedHistIds(new Set());
  const setRascunho = (id: string, patch: RascunhoMens) => {
    setRascunhos((prev) => {
      const atual = { ...(prev[id] ?? {}), ...patch };
      // remove chaves iguais ao valor original para permitir descarte automático
      const original = mens.find((m) => m.id === id);
      if (original) {
        if (atual.vencimento !== undefined && atual.vencimento === original.vencimento)
          delete atual.vencimento;
        if (atual.valor !== undefined && Number(atual.valor) === Number(original.valor))
          delete atual.valor;
        if (
          atual.pago_em !== undefined &&
          (atual.pago_em ?? null) === (original.pago_em ?? null)
        )
          delete atual.pago_em;
      }
      const novo = { ...prev };
      if (Object.keys(atual).length === 0) delete novo[id];
      else novo[id] = atual;
      return novo;
    });
  };
  const totalRascunhos = Object.keys(rascunhos).length;
  const [extraRecebido, setExtraRecebido] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
  const [drill, setDrill] = useState<null | "pagas" | "recebido" | "areceber">(null);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [contratosAnteriores, setContratosAnteriores] = useState<Array<{
    id: string;
    numero: string | number | null;
    convenio: string | null;
    data_inicio: string | null;
    data_termino: string | null;
    status: string | null;
    parcelas: number;
    pagas: number;
  }>>([]);
  // Ciclos de renovação por extensão dentro do MESMO contrato. A RPC
  // renovar_contrato_extensao acrescenta N novas mensalidades (numero_parcela
  // continua sequencial: 13..24, 25..36, etc.) no mesmo contrato. Para não
  // inflar o contador N/M, separamos em ciclos.
  const [renovacoes, setRenovacoes] = useState<Array<{
    id: string;
    tipo: string | null;
    parcelas_geradas: number | null;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    created_at: string | null;
  }>>([]);
  const [convenio, setConvenio] = useState<any>(null);
  const [clinica, setClinica] = useState<any>(null);
  const [pacienteFull, setPacienteFull] = useState<any>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [loading, setLoading] = useState(true);
  const gerarBoletosFn = useServerFn(gerarBoletosContrato);
  // NFS-e a partir da parcela paga (mensalidade/taxa adesão).
  // Reaproveita o mesmo picker/prompt usados no Financeiro › Atendimentos.
  const emitirNfseFn = useServerFn(emitirNfse);
  const consultarNfseFn = useServerFn(consultarNfse);
  const { pick: pickTomadorNfse, dialog: tomadorNfseDialog } = usePickTomador();
  const { prompt: pedirDescricaoNfse, dialog: descricaoNfseDialog } = usePromptDescricaoNfse();
  const [emitentes, setEmitentes] = useState<Array<{ id: string; nome: string }>>([]);
  const [emitenteId, setEmitenteId] = useState<string>("");
  const [nfsePorLancamento, setNfsePorLancamento] = useState<Record<string, { id: string; numero: string | null; status: string | null; pdf_url: string | null }>>({});
  const [nfseEmitindoId, setNfseEmitindoId] = useState<string | null>(null);

  // Inclusão/exclusão de dependentes pós-venda
  const [incOpen, setIncOpen] = useState(false);
  const [incPaciente, setIncPaciente] = useState<PatientOption | null>(null);
  const [incParentesco, setIncParentesco] = useState<string>("");
  const [incTipo, setIncTipo] = useState<string>("dependente");
  const [incSaving, setIncSaving] = useState(false);
  // Taxa de inclusão de dependente (cobrança avulsa gerada junto com a
  // inclusão pós-venda). Padrão: cobrar sempre, exceto quando a inclusão é
  // feita no mesmo dia da venda (data_inicio do contrato). Valor sugerido
  // vem de cb_convenios.taxa_inclusao_dependente e permanece editável.
  const [incCobrarTaxa, setIncCobrarTaxa] = useState<boolean>(true);
  const [incTaxaValor, setIncTaxaValor] = useState<string>("0.00");
  const [incTaxaVenc, setIncTaxaVenc] = useState<string>(() => new Date().toISOString().slice(0, 10));
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
  // Renovação do contrato
  const [renovarOpen, setRenovarOpen] = useState(false);
  // Troca de convênio (cancela o contrato atual e cria um novo sem taxa/carência).
  const [trocarConvenioOpen, setTrocarConvenioOpen] = useState(false);
  const [renovadoEm, setRenovadoEm] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    setRenovadoEm((contrato as any).renovado_em ?? null);
    (async () => {
      const { data } = await supabase
        .from("contrato_renovacoes")
        .select("created_at")
        .eq("contrato_id", contrato.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelado) setRenovadoEm((data as any)?.created_at ?? (contrato as any).renovado_em ?? null);
    })();
    return () => { cancelado = true; };
  }, [contrato.id]);
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
  // Guarda a faixa que foi auto-sincronizada com o valor_mensal atual.
  // Só sobrescrevemos valor_mensal no salvarContratoAdmin se o usuário
  // trocou explicitamente para uma faixa diferente desta inicial.
  const admFaixaIdInicialRef = useRef<string>("");
  const [apenasFinanceiro, setApenasFinanceiro] = useState<boolean>(
    !!(contrato as any).titular_apenas_financeiro,
  );
  const [savingApenasFin, setSavingApenasFin] = useState(false);
  // Isenção manual de carência (Admin/Gestor).
  const [semCarencia, setSemCarencia] = useState<boolean>(
    !!(contrato as any).sem_carencia,
  );
  const [semCarenciaMotivo, setSemCarenciaMotivo] = useState<string>(
    (contrato as any).sem_carencia_motivo ?? "",
  );
  const [savingSemCarencia, setSavingSemCarencia] = useState(false);
  const roleAtual = (clinicaAtual?.role ?? "").toLowerCase();
  const podeEditarCarencia = roleAtual === "admin" || roleAtual === "gestor";
  const [retroDialog, setRetroDialog] = useState<{ open: boolean; parcelasPagas: string; dataInicio: string } | null>(null);
  const [regerandoRetro, setRegerandoRetro] = useState(false);
  useEffect(() => {
    setAdmConvenioId(contrato.convenio_id ?? "");
    setAdmDataInicio(contrato.data_inicio ?? "");
    setAdmTaxaAdesao(String(Number(contrato.taxa_adesao ?? 0).toFixed(2)));
    setAdmForma(contrato.forma_pagamento ?? "");
    setAdmObs(contrato.observacoes ?? "");
    setApenasFinanceiro(!!(contrato as any).titular_apenas_financeiro);
    setSemCarencia(!!(contrato as any).sem_carencia);
    setSemCarenciaMotivo((contrato as any).sem_carencia_motivo ?? "");
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
    const novaDataFim = addUmAno(admDataInicio);
    // Só aplica novo valor_mensal se o usuário trocou explicitamente a faixa
    // em relação à sincronização inicial. Sem isso, um fallback silencioso
    // do dropdown rebaixaria o valor do contrato (ver bug #20260945).
    const faixaFoiTrocada =
      !!admFaixaId && admFaixaId !== admFaixaIdInicialRef.current;
    const faixaEscolhida = faixaFoiTrocada
      ? faixas.find((f) => f.id === admFaixaId)
      : null;
    const novoValorMensal = faixaEscolhida ? Number(faixaEscolhida.valor_mensal) : null;
    const updatePayload: any = {
      convenio_id: admConvenioId,
      paciente_id: admPaciente.id,
      paciente_nome: admPaciente.nome,
      data_inicio: admDataInicio,
      data_fim: novaDataFim,
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
    (contrato as any).data_fim = novaDataFim;
    (contrato as any).taxa_adesao = taxa;
    (contrato as any).forma_pagamento = admForma || null;
    (contrato as any).observacoes = admObs || null;
    if (novoValorMensal != null && novoValorMensal !== Number(valorMensalAtual)) {
      (contrato as any).valor_mensal = novoValorMensal;
      setValorMensalAtual(novoValorMensal);
      // Recalcula parcelas em aberto para o novo valor
      const abertas = mens.filter((m) => !isEncargoAvulso(m) && m.status !== "pago");
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

  // Salva a isenção manual de carência (Admin/Gestor).
  const salvarSemCarencia = async (novoValor: boolean, motivo: string) => {
    if (!podeEditarCarencia) {
      toast.error("Apenas Admin ou Gestor podem alterar a carência.");
      return;
    }
    if (novoValor && !motivo.trim()) {
      toast.error("Informe o motivo da isenção de carência.");
      return;
    }
    setSavingSemCarencia(true);
    const payload: any = novoValor
      ? {
          sem_carencia: true,
          sem_carencia_motivo: motivo.trim(),
          sem_carencia_por: user?.id ?? null,
          sem_carencia_em: new Date().toISOString(),
        }
      : {
          sem_carencia: false,
          sem_carencia_motivo: null,
          sem_carencia_por: null,
          sem_carencia_em: null,
        };
    const { error } = await supabase
      .from("contratos_assinatura")
      .update(payload)
      .eq("id", contrato.id);
    setSavingSemCarencia(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    (contrato as any).sem_carencia = payload.sem_carencia;
    (contrato as any).sem_carencia_motivo = payload.sem_carencia_motivo;
    (contrato as any).sem_carencia_por = payload.sem_carencia_por;
    (contrato as any).sem_carencia_em = payload.sem_carencia_em;
    setSemCarencia(payload.sem_carencia);
    setSemCarenciaMotivo(payload.sem_carencia_motivo ?? "");
    toast.success(
      payload.sem_carencia
        ? "Contrato marcado como isento de carência."
        : "Isenção de carência removida.",
    );
    await load();
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
    // 1) Apaga TODAS as mensalidades (≠0) — pendentes e pagas —
    // para regenerar exatamente 12 parcelas numeradas de 1 a 12.
    // Sem isso, uma parcela órfã anterior fazia o prox virar 2 e o
    // contrato terminar com 13 linhas (bug do contrato #20261888).
    const { error: delErr } = await supabase
      .from("contrato_mensalidades")
      .delete()
      .eq("contrato_id", contrato.id)
      .gt("numero_parcela", 0);
    if (delErr) {
      setRegerandoRetro(false);
      return mostrarErro(delErr);
    }
    // 2) Gera exatamente 12 parcelas (1..12) a partir do mês da nova data de início
    let prox = 1;
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
    // Alerta se houver rascunhos pendentes — evita perder edições ao recarregar.
    if (totalRascunhos > 0) {
      if (!confirm("Existem alterações não salvas nas mensalidades. Deseja descartar e adicionar uma nova parcela?")) return;
      setRascunhos({});
    }
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
    setRascunhos((prev) => { const n = { ...prev }; delete n[id]; return n; });
    await load();
  };

  // Persiste em lote as alterações feitas nos campos editáveis da tabela
  // Mensalidades (vencimento / valor / pago_em). Também ajusta status para
  // "pago" quando o usuário preencher pago_em em uma parcela pendente, e volta
  // para "pendente" quando limpar pago_em de uma parcela paga historicamente
  // (sem lançamento no caixa).
  const salvarRascunhos = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const ids = Object.keys(rascunhos);
    if (ids.length === 0) return;
    setSalvandoRascunhos(true);
    let ok = 0;
    let bloqueadas = 0;
    try {
      for (const id of ids) {
        const original = mens.find((m) => m.id === id);
        if (!original) continue;
        const draft = rascunhos[id];
        const payload: Record<string, any> = {};
        if (draft.vencimento !== undefined) payload.vencimento = draft.vencimento;
        if (draft.valor !== undefined) payload.valor = Number(draft.valor);
        if (draft.pago_em !== undefined) {
          const novoPagoEm = draft.pago_em || null;
          const eraPago = original.status === "pago";
          // Bloqueia limpar pago_em quando existe lançamento vinculado (Caixa)
          if (!novoPagoEm && eraPago && original.lancamento_id) {
            bloqueadas++;
            continue;
          }
          payload.pago_em = novoPagoEm;
          if (novoPagoEm && !eraPago) {
            payload.status = "pago";
            if (original.valor && (payload as any).valor === undefined) {
              payload.valor_pago = Number(original.valor);
            } else if (payload.valor !== undefined) {
              payload.valor_pago = Number(payload.valor);
            }
          } else if (!novoPagoEm && eraPago && !original.lancamento_id) {
            payload.status = "pendente";
            payload.valor_pago = null;
            payload.forma_pagamento = null;
          }
        }
        if (Object.keys(payload).length === 0) continue;
        const { error } = await supabase
          .from("contrato_mensalidades")
          .update(payload as any)
          .eq("id", id);
        if (error) {
          mostrarErro(error);
          continue;
        }
        ok++;
      }
      if (bloqueadas > 0) {
        toast.error(
          `${bloqueadas} parcela(s) não puderam ter "Pago em" removido — foram pagas pelo Caixa. Estorne pelo Caixa antes.`,
        );
      }
      if (ok > 0) toast.success(`${ok} parcela(s) atualizada(s).`);
      setRascunhos({});
      await load();
    } finally {
      setSalvandoRascunhos(false);
    }
  };

  const descartarRascunhos = () => {
    if (totalRascunhos === 0) return;
    if (!confirm("Descartar todas as alterações não salvas?")) return;
    setRascunhos({});
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
        .gt("numero_parcela", 0)
        .gt("vencimento", hoje);
      // Conta parcelas restantes (≠0) — geralmente pagas/atrasadas anteriores a hoje.
      // Todo contrato deve ter no máximo 12 mensalidades: gera só o que falta.
      const { data: restantes } = await supabase
        .from("contrato_mensalidades")
        .select("numero_parcela")
        .eq("contrato_id", contrato.id)
        .gt("numero_parcela", 0)
        .order("numero_parcela", { ascending: false });
      const existentes = restantes ?? [];
      const maxExistente = existentes.reduce(
        (mx, r) => Math.max(mx, Number((r as { numero_parcela: number }).numero_parcela) || 0),
        0,
      );
      const restantesParaGerar = Math.max(0, 12 - existentes.length);
      let prox = maxExistente + 1;
      const inicio = new Date();
      inicio.setDate(1);
      const rows: any[] = [];
      for (let i = 1; i <= restantesParaGerar; i++) {
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
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("contrato_mensalidades").insert(rows);
        if (insErr) {
          setSavingDados(false);
          mostrarErro(insErr, "dados salvos, mas falha ao gerar parcelas");
          await load();
          return;
        }
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
            .select("nome, modelo_contrato, termo_inclusao_html, vigencia_meses, fidelidade_meses, max_dependentes, taxa_adesao, taxa_inclusao_dependente")
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
        .select("cpf, data_nascimento, telefone, email, logradouro, numero, bairro, cidade, estado, cep, codigo_prontuario")
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
    let prontMap: Record<string, string | null> = {};
    if (pids.length) {
      const { data: pacs } = await supabase
        .from("pacientes")
        .select("id, cpf, codigo_prontuario")
        .in("id", pids);
      cpfMap = Object.fromEntries((pacs ?? []).map((p: any) => [p.id, p.cpf]));
      prontMap = Object.fromEntries((pacs ?? []).map((p: any) => [p.id, p.codigo_prontuario]));
    }
    const depsRows = rows.map((r) => ({
      id: r.id,
      paciente_id: r.paciente_id,
      paciente_nome: r.paciente_nome,
      parentesco: r.parentesco,
      tipo: r.tipo,
      cpf: cpfMap[r.paciente_id] ?? null,
      codigo_prontuario: prontMap[r.paciente_id] ?? null,
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
    // Contratos anteriores do mesmo paciente (histórico) — não junta parcelas
    // com o contrato atual; apenas lista lado a lado para conferência.
    if (pacienteId) {
      const { data: antRows } = await supabase
        .from("contratos_assinatura")
        .select("id, numero, status, data_inicio, data_termino, convenio_id, created_at")
        .eq("paciente_id", pacienteId)
        .neq("id", contrato.id)
        .order("created_at", { ascending: false });
      const anteriores = (antRows ?? []) as any[];
      if (anteriores.length) {
        const ids = anteriores.map((c) => c.id);
        const convIds = Array.from(
          new Set(anteriores.map((c) => c.convenio_id).filter(Boolean)),
        );
        const [{ data: mensAll }, { data: convs }] = await Promise.all([
          supabase
            .from("contrato_mensalidades")
            .select("contrato_id, status, numero_parcela")
            .in("contrato_id", ids),
          convIds.length
            ? supabase.from("cb_convenios").select("id, nome").in("id", convIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const convMap: Record<string, string> = Object.fromEntries(
          ((convs as any)?.data ?? convs ?? []).map((c: any) => [c.id, c.nome]),
        );
        const counts: Record<string, { parcelas: number; pagas: number }> = {};
        ((mensAll ?? []) as any[]).forEach((m) => {
          if ((m.numero_parcela ?? 0) <= 0) return; // ignora adesão/taxa
          const c = counts[m.contrato_id] ?? { parcelas: 0, pagas: 0 };
          c.parcelas += 1;
          if (m.status === "pago") c.pagas += 1;
          counts[m.contrato_id] = c;
        });
        setContratosAnteriores(
          anteriores.map((c) => ({
            id: c.id,
            numero: c.numero ?? null,
            convenio: c.convenio_id ? convMap[c.convenio_id] ?? null : null,
            data_inicio: c.data_inicio ?? null,
            data_termino: c.data_termino ?? null,
            status: c.status ?? null,
            parcelas: counts[c.id]?.parcelas ?? 0,
            pagas: counts[c.id]?.pagas ?? 0,
          })),
        );
      } else {
        setContratosAnteriores([]);
      }
    } else {
      setContratosAnteriores([]);
    }
    // Carrega ciclos de renovação por extensão deste contrato (mesmo id).
    // Usamos os tamanhos (parcelas_geradas) e a ordem cronológica para
    // segmentar as mensalidades em ciclos (Original, Renovação 1, ...).
    {
      const { data: renRows } = await supabase
        .from("contrato_renovacoes")
        .select("id, tipo, parcelas_geradas, periodo_inicio, periodo_fim, created_at")
        .eq("contrato_id", contrato.id)
        .order("created_at", { ascending: true });
      setRenovacoes(((renRows ?? []) as any[]).map((r) => ({
        id: r.id,
        tipo: r.tipo ?? null,
        parcelas_geradas: r.parcelas_geradas ?? null,
        periodo_inicio: r.periodo_inicio ?? null,
        periodo_fim: r.periodo_fim ?? null,
        created_at: r.created_at ?? null,
      })));
    }
    setLoading(false);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [contrato.id]);

  // Carrega emitentes NFS-e ativos da clínica (para o botão "Emitir NFS-e"
  // nas parcelas). Se não houver emitente cadastrado, o botão avisa o usuário.
  useEffect(() => {
    if (!clinicaAtual?.clinica_id) { setEmitentes([]); setEmitenteId(""); return; }
    let cancel = false;
    void supabase
      .from("nfse_emitentes_publico")
      .select("id, nome")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        if (cancel) return;
        const list = (data ?? []) as Array<{ id: string; nome: string }>;
        setEmitentes(list);
        setEmitenteId((prev) => prev || (list[0]?.id ?? ""));
      });
    return () => { cancel = true; };
  }, [clinicaAtual?.clinica_id]);

  // Carrega NFS-e já emitidas para as parcelas deste contrato (indexadas por
  // lancamento_id da parcela). Assim conseguimos: (1) esconder o botão de
  // emitir; (2) mostrar o número/link do PDF.
  useEffect(() => {
    const ids = mens
      .map((m) => m.lancamento_id)
      .filter((v): v is string => !!v);
    if (!ids.length || !clinicaAtual?.clinica_id) {
      setNfsePorLancamento({});
      return;
    }
    let cancel = false;
    void supabase
      .from("nfse")
      .select("id, numero, status, url_pdf, pagamento_id")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .in("pagamento_id", ids)
      .neq("status", "cancelada")
      .then(({ data }) => {
        if (cancel) return;
        const map: Record<string, { id: string; numero: string | null; status: string | null; pdf_url: string | null }> = {};
        for (const r of (data ?? []) as Array<{ id: string; numero: string | null; status: string | null; url_pdf: string | null; pagamento_id: string }>) {
          map[r.pagamento_id] = { id: r.id, numero: r.numero, status: r.status, pdf_url: r.url_pdf };
        }
        setNfsePorLancamento(map);
      });
    return () => { cancel = true; };
  }, [mens, clinicaAtual?.clinica_id]);

  // Sincroniza a faixa "admin" com a faixa vigente (baseada no valor_mensal atual)
  useEffect(() => {
    if (!faixas.length) {
      setAdmFaixaId("");
      admFaixaIdInicialRef.current = "";
      return;
    }
    const v = Number(valorMensalAtual);
    // Só auto-seleciona a faixa quando há match exato com o valor_mensal.
    // Sem match (ex.: contrato em tabela antiga cujo valor não existe mais
    // nas faixas atuais), deixa vazio para não sugerir uma faixa incorreta.
    const match = faixas.find((f) => Number(f.valor_mensal) === v) ?? null;
    const id = match?.id ?? "";
    setAdmFaixaId(id);
    admFaixaIdInicialRef.current = id;
  }, [faixas, valorMensalAtual]);

  // Ao trocar o convênio na aba Dados (modo admin), recarrega as faixas de
  // pessoas do novo convênio para que o select "Faixa de pessoas" mostre
  // as opções corretas. Sem isso, ficavam as faixas do convênio original.
  useEffect(() => {
    if (!admConvenioId) { setFaixas([]); return; }
    if (admConvenioId === contrato.convenio_id) return; // já carregado pelo load()
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("cb_convenio_faixas")
        .select("*")
        .eq("convenio_id", admConvenioId)
        .order("vidas_de");
      if (!cancelado) setFaixas(((data ?? []) as Faixa[]));
    })();
    return () => { cancelado = true; };
  }, [admConvenioId, contrato.convenio_id]);

  // Busca de pacientes agora é feita sob demanda pelo PatientSearchInput.

  const marcarPago = async (
    id: string,
    paga: boolean,
    forma?: string | null,
    lancamentoId?: string | null,
    valorPago?: number | null,
    pagoEm?: string | null,
  ) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    // Grava lancamento_id + valor_pago junto com o status: sem isso a
    // mensalidade fica marcada como paga sem ponte confiável para o
    // lançamento financeiro (auditoria/estorno não conseguem localizá-lo).
    // Quando o operador escolhe uma data retroativa no LancamentoDialog,
    // `pagoEm` traz essa data — sem isso `pago_em` ficaria sempre em "hoje",
    // mesmo que o lançamento e o movimento de caixa já tenham ido para a data
    // retroativa correta (a RPC fn_registrar_lancamento_e_caixa cuida disso).
    const patch = paga
      ? {
          status: "pago",
          pago_em: pagoEm && pagoEm.length > 0 ? pagoEm : new Date().toISOString().slice(0, 10),
          ...(forma !== undefined ? { forma_pagamento: forma } : {}),
          ...(lancamentoId ? { lancamento_id: lancamentoId } : {}),
          ...(valorPago != null ? { valor_pago: valorPago } : {}),
        }
      : { status: "pendente", pago_em: null, forma_pagamento: null, lancamento_id: null, valor_pago: null };
    const { error } = await supabase.from("contrato_mensalidades").update(patch).eq("id", id);
    if (error) return mostrarErro(error);
    load();
  };

  // Botão "Reverter": antes só zerava os campos da mensalidade, sem tocar no
  // lançamento nem no caixa — podia sobrar mensalidade pendente com dinheiro
  // confirmado no caixa. Agora usa a mesma rotina de estorno do módulo
  // Financeiro > Estorno (cancela o lançamento, reverte o caixa e reabre a
  // mensalidade), centralizando os dois pontos de entrada num único fluxo.
  const reverterMensalidade = async (m: Mens) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!m.lancamento_id) {
      // Mensalidade paga antes desta correção, sem lançamento vinculado —
      // não há o que estornar no financeiro/caixa, só reabre a parcela.
      await marcarPago(m.id, false);
      return;
    }
    const resultado = await estornarLancamentoReceita(m.lancamento_id, clinicaAtual?.clinica_id);
    if (!resultado.ok) {
      if (resultado.motivo === "repasse_pago") {
        toast.error(resultado.mensagem);
      } else {
        mostrarErro(resultado.error, resultado.mensagem);
      }
      return;
    }
    toast.success("Pagamento estornado: lançamento cancelado, caixa revertido e mensalidade reaberta.");
    load();
  };

  // Marca uma parcela pendente como "paga historicamente":
  // atualiza status/pago_em/valor_pago SEM criar lançamento no caixa.
  // Uso: regularizar contratos cuja 1ª (ou primeiras) mensalidades já
  // foram pagas fora do sistema, sem precisar cancelar e refazer o contrato.
  const marcarPagaHistorica = async (m: Mens) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (m.status === "pago") return;
    const ok = confirm(
      `Marcar a parcela ${isAdesao(m) ? "de adesão" : m.numero_parcela} como paga historicamente?\n\n` +
      `Ela ficará como PAGA no contrato, mas NÃO gerará movimento no caixa nem lançamento financeiro. ` +
      `Use apenas para regularizar pagamentos feitos fora do sistema.`
    );
    if (!ok) return;
    const valor = Number(m.valor) || 0;
    const { error } = await supabase
      .from("contrato_mensalidades")
      .update({
        status: "pago",
        pago_em: m.vencimento,
        valor_pago: valor,
        forma_pagamento: null,
        lancamento_id: null,
      })
      .eq("id", m.id);
    if (error) return mostrarErro(error);
    toast.success("Parcela marcada como paga (histórica). Não foi lançada no caixa.");
    load();
  };

  const marcarPagasHistoricasEmLote = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const ids = Array.from(selectedHistIds);
    const alvos = mens.filter((m) => ids.includes(m.id) && m.status !== "pago");
    if (alvos.length === 0) { toast.error("Selecione ao menos uma parcela em aberto."); return; }
    const total = alvos.reduce((s, m) => s + (Number(m.valor) || 0), 0);
    const nums = alvos
      .map((m) => (isAdesao(m) ? "Adesão" : isTaxaInclusao(m) ? "Taxa" : `#${m.numero_parcela}`))
      .join(", ");
    const ok = confirm(
      `Marcar ${alvos.length} parcela(s) como paga (histórica)?\n\n` +
      `Parcelas: ${nums}\n` +
      `Total: R$ ${total.toFixed(2).replace(".", ",")}\n\n` +
      `Elas ficarão como PAGAS no contrato, mas NÃO gerarão movimento no caixa nem lançamento financeiro. ` +
      `Use apenas para regularizar pagamentos feitos fora do sistema.`,
    );
    if (!ok) return;
    setAplicandoHistLote(true);
    try {
      // Cada parcela precisa de pago_em/valor_pago próprios — updates em
      // paralelo mantêm o mesmo comportamento do fluxo unitário.
      const results = await Promise.all(
        alvos.map((m) =>
          supabase
            .from("contrato_mensalidades")
            .update({
              status: "pago",
              pago_em: m.vencimento,
              valor_pago: Number(m.valor) || 0,
              forma_pagamento: null,
              lancamento_id: null,
            })
            .eq("id", m.id),
        ),
      );
      const erro = results.find((r) => r.error)?.error;
      if (erro) return mostrarErro(erro);
      toast.success(`${alvos.length} parcela(s) marcada(s) como paga (histórica). Não foram lançadas no caixa.`);
      limparHistSel();
      load();
    } finally {
      setAplicandoHistLote(false);
    }
  };

  const abrirFormaPag = (m: Mens) => {
    setPagMens(m);
    setFormaPagOpen(true);
  };

  // Emite NFS-e a partir de uma parcela paga (mensalidade ou taxa de adesão).
  // Reutiliza o mesmo picker/prompt do módulo Financeiro › Atendimentos,
  // com bloqueio de endereço e escolha de percentual do valor.
  const emitirNfseParcela = async (m: Mens) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual) return;
    if (!m.lancamento_id) {
      toast.error("Esta parcela não tem lançamento financeiro vinculado — não é possível emitir NFS-e.");
      return;
    }
    if (!emitentes.length || !emitenteId) {
      toast.error("Cadastre um emitente ativo em Configurações › NFS-e antes de emitir.");
      return;
    }
    const pac = pacienteFull ?? {};
    const nomePac = contrato.paciente_nome ?? "";
    if (!nomePac) { toast.error("Contrato sem paciente vinculado."); return; }
    const valorBase = Number(m.valor_pago ?? m.valor) || 0;
    if (valorBase <= 0) { toast.error("Valor pago da parcela é zero."); return; }
    setNfseEmitindoId(m.id);
    try {
      const tomador = await pickTomadorNfse({
        paciente: {
          nome: nomePac,
          cpfCnpj: pac.cpf ?? undefined,
          email: pac.email ?? undefined,
          cep: pac.cep ?? undefined,
          logradouro: pac.logradouro ?? undefined,
          numero: pac.numero ?? undefined,
          bairro: pac.bairro ?? undefined,
          municipio: pac.cidade ?? undefined,
          uf: pac.estado ?? undefined,
        },
        valorBase,
      });
      if (!tomador) { toast.error("Emissão cancelada."); return; }
      const parcial = aplicarValorParcial(valorBase, tomador);
      const convNome = convenio?.nome ? ` — Cartão Benefício ${convenio.nome}` : " — Cartão Benefício";
      const rotulo = isAdesao(m)
        ? `Taxa de adesão${convNome} — Contrato #${contrato.numero} — ${nomePac}`
        : `Mensalidade ${m.numero_parcela}/${mensalidades.length}${convNome} — Contrato #${contrato.numero} — ${nomePac}`;
      const descComDep = tomador.dependenteAtendido
        ? `${rotulo} — Atendido: ${tomador.dependenteAtendido}`
        : rotulo;
      const descSugerida = `${descComDep}${parcial.descricaoSufixo}`;
      const descFinal = await pedirDescricaoNfse(descSugerida);
      if (!descFinal) { toast.error("Emissão cancelada."); return; }
      const paciente_id = (contrato as { paciente_id?: string | null }).paciente_id ?? undefined;
      const res = await emitirNfseFn({
        data: {
          emitenteId,
          pacienteId: paciente_id,
          pagamentoId: m.lancamento_id,
          valorServicos: parcial.valor,
          descricaoServicos: descFinal,
          tomador,
        },
      });
      const nfseId = (res as { id?: string })?.id;
      toast.success("NFS-e enviada. Consultando status...");
      if (nfseId) {
        await new Promise((r) => setTimeout(r, 4000));
        await consultarNfseFn({ data: { id: nfseId } });
      }
      // Recarrega o mapa de NFS-e emitidas para trocar o botão pelo link.
      const { data } = await supabase
        .from("nfse")
        .select("id, numero, status, url_pdf, pagamento_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .in("pagamento_id", [m.lancamento_id])
        .neq("status", "cancelada");
      const row = (data ?? [])[0] as
        | { id: string; numero: string | null; status: string | null; url_pdf: string | null; pagamento_id: string }
        | undefined;
      if (row) {
        setNfsePorLancamento((prev) => ({
          ...prev,
          [row.pagamento_id]: { id: row.id, numero: row.numero, status: row.status, pdf_url: row.url_pdf },
        }));
      }
    } catch (e) {
      mostrarErro(e);
    } finally {
      setNfseEmitindoId(null);
    }
  };

  // Multa de 10% + juros de 0,33% ao dia para parcelas vencidas.
  // Regra de negócio: tolerância de 5 dias corridos após o vencimento — nesse
  // intervalo não incidem encargos. A partir do 6º dia de atraso aplica-se
  // multa e juros retroativos.
  const calcValorComJuros = (m: Mens | null): number => {
    if (!m) return 0;
    const base = Number(m.valor) || 0;
    if (m.status === "pago") return base;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(m.vencimento + "T00:00:00");
    const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
    if (diasAtraso <= 5) return base;
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

  const mensalidades = mens.filter((m) => !isEncargoAvulso(m));
  // Adesão embutida na 1ª parcela (numero_parcela = 1 com taxa_adesao > 0):
  // enquanto essa parcela estiver pendente, a linha da adesão é cobrada junto
  // com ela e o botão "Pagar" da linha da adesão fica oculto para evitar dupla
  // cobrança. Se a 1ª parcela já foi paga (histórica, por exemplo) sem quitar a
  // adesão, a linha da adesão volta a permitir pagamento avulso.
  const primeiraParcela = mensalidades.find((m) => m.numero_parcela === 1);
  const adesaoEmbutida = Boolean(
    primeiraParcela &&
      primeiraParcela.status !== "pago" &&
      Number(primeiraParcela.taxa_adesao ?? 0) > 0,
  );
  const pagas = mensalidades.filter((m) => m.status === "pago").length;
  const totalPagoMens = mens.filter((m) => m.status === "pago").reduce((s, m) => s + Number(m.valor), 0);
  const totalPago = totalPagoMens + extraRecebido.total;
  // Segmenta mensalidades em CICLOS: ciclo 1 = parcelas 1..N0 (contrato
  // original, N0 = contrato.num_parcelas); ciclos seguintes usam
  // parcelas_geradas de cada renovação por extensão, em ordem cronológica.
  // Renovações do tipo troca_plano geram contrato NOVO (não caem aqui) e
  // aparecem em "Contratos anteriores deste paciente".
  const parcelasMensais = mensalidades
    .filter((m) => (m.numero_parcela ?? 0) > 0)
    .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));
  const tamanhoOriginal = Math.max(
    1,
    Number((contrato as any).num_parcelas) || 12,
  );
  const tamanhosCiclos: number[] = [tamanhoOriginal];
  for (const r of renovacoes) {
    if (r.tipo === "extensao" && Number(r.parcelas_geradas ?? 0) > 0) {
      tamanhosCiclos.push(Number(r.parcelas_geradas));
    }
  }
  // Constrói ciclos como fatias sobre parcelasMensais (ordenadas). Se o total
  // real de parcelas não bater com a soma dos tamanhos, o último ciclo
  // absorve o excedente para não perder linhas.
  type Ciclo = {
    index: number; // 0 = original, 1 = 1ª renovação, ...
    label: string;
    tipo: "original" | "extensao";
    parcelas: Mens[];
    inicio: string | null;
    fim: string | null;
  };
  const ciclos: Ciclo[] = [];
  {
    let cursor = 0;
    for (let i = 0; i < tamanhosCiclos.length; i++) {
      const isLast = i === tamanhosCiclos.length - 1;
      const take = isLast
        ? parcelasMensais.length - cursor
        : Math.min(tamanhosCiclos[i], parcelasMensais.length - cursor);
      const slice = parcelasMensais.slice(cursor, cursor + Math.max(0, take));
      cursor += Math.max(0, take);
      const tipoCiclo: Ciclo["tipo"] = i === 0 ? "original" : "extensao";
      ciclos.push({
        index: i,
        tipo: tipoCiclo,
        label: i === 0 ? "Ciclo original" : `Renovação ${i}`,
        parcelas: slice,
        inicio: slice[0]?.vencimento ?? null,
        fim: slice[slice.length - 1]?.vencimento ?? null,
      });
      if (cursor >= parcelasMensais.length) break;
    }
  }
  const cicloAtual = ciclos[ciclos.length - 1] ?? null;
  const ciclosAnteriores = ciclos.slice(0, -1);
  const temCiclosMultiplos = ciclos.length > 1;
  // Mapa id → { posição dentro do ciclo, total do ciclo, índice do ciclo }.
  // Usado para reiniciar a numeração exibida a cada renovação e para ordenar
  // as linhas por ciclo (mais recente primeiro).
  const parcelaLocalPorId: Record<string, { pos: number; total: number; ciclo: number }> = {};
  for (const c of ciclos) {
    c.parcelas.forEach((p, idx) => {
      parcelaLocalPorId[p.id] = { pos: idx + 1, total: c.parcelas.length, ciclo: c.index };
    });
  }
  // Linhas exibidas na tabela de "Mensalidades": adesão primeiro, taxas de
  // inclusão em seguida (por vencimento), e por último as parcelas mensais
  // agrupadas por ciclo — do mais recente para o mais antigo — mantendo a
  // ordem crescente dentro de cada ciclo.
  const linhasCobranca = [...mens].sort((a, b) => {
    const rank = (m: Mens) => (isAdesao(m) ? 0 : isTaxaInclusao(m) ? 1 : 2);
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 2) {
      const ca = parcelaLocalPorId[a.id]?.ciclo ?? 0;
      const cb = parcelaLocalPorId[b.id]?.ciclo ?? 0;
      if (ca !== cb) return cb - ca; // ciclo mais recente primeiro
      return a.numero_parcela - b.numero_parcela;
    }
    return (a.vencimento || "").localeCompare(b.vencimento || "");
  });
  // "Pagas X/Y" reflete o CICLO ATUAL quando o contrato tem renovações por
  // extensão; caso contrário, é igual ao total de mensalidades do contrato.
  const pagasTotal = temCiclosMultiplos
    ? (cicloAtual?.parcelas.filter((m) => m.status === "pago").length ?? 0)
    : pagas;
  const totalParcelas = temCiclosMultiplos
    ? (cicloAtual?.parcelas.length ?? 0)
    : mensalidades.length;
  const aReceber = mens.filter((m) => m.status !== "pago").reduce((s, m) => s + Number(m.valor), 0);

  // ---- Dados da venda (aba "Dados") ----
  const titularConta = apenasFinanceiro ? 0 : 1;
  const totalVidasAtual = titularConta + deps.filter((d) => d.ativo).length;
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
  const convenioMaxDep = Number(convenio?.max_dependentes ?? 0) || 0;
  const faixaSelecionadaEdicao = admFaixaId ? faixas.find((f) => f.id === admFaixaId) : faixaAtual;
  const titularOcupaVaga = apenasFinanceiro ? 0 : 1;
  const maxDep =
    faixaSelecionadaEdicao && faixaSelecionadaEdicao.vidas_ate != null
      ? Math.max(0, Number(faixaSelecionadaEdicao.vidas_ate) - titularOcupaVaga)
      : convenioMaxDep;
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
    const abertas = mens.filter((m) => !isEncargoAvulso(m) && m.status !== "pago");
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
    // Valida os campos da taxa quando marcada (não bloqueia a inclusão do
    // dependente por engano do valor — mensagem clara ao operador).
    const taxaValor = Number(String(incTaxaValor).replace(",", "."));
    if (incCobrarTaxa) {
      if (!Number.isFinite(taxaValor) || taxaValor <= 0) {
        toast.error("Informe um valor válido para a taxa de inclusão.");
        return;
      }
      if (!incTaxaVenc) {
        toast.error("Informe o vencimento da taxa de inclusão.");
        return;
      }
    }
    setIncSaving(true);
    const resultado = await incluirDependenteContrato({
      contratoId: contrato.id,
      pacienteId: incPaciente.id,
      pacienteNome: incPaciente.nome,
      parentesco: incParentesco || null,
      tipo: incTipo,
      taxa: incCobrarTaxa ? { valor: taxaValor, vencimento: incTaxaVenc } : null,
    });
    setIncSaving(false);
    if (!resultado.ok) {
      toast.error(resultado.mensagem);
      return;
    }
    const data = resultado.dependente;
    if (resultado.taxaAviso) {
      toast.error(resultado.taxaAviso);
    } else if (resultado.taxa) {
      toast.success(`Dependente incluído. Taxa de inclusão de ${BRL(Number(resultado.taxa.valor))} lançada em Mensalidades.`);
    } else {
      toast.success("Dependente incluído");
    }
    setIncOpen(false);
    const novoDep: Dep = {
      id: data.id,
      paciente_id: data.paciente_id,
      paciente_nome: data.paciente_nome,
      parentesco: data.parentesco,
      tipo: data.tipo,
      cpf: incPaciente.cpf,
      incluido_em: data.incluido_em,
      excluido_em: data.excluido_em,
      ativo: !!data.ativo,
    };
    setIncPaciente(null);
    setIncParentesco("");
    setIncTipo("dependente");
    // Recalcula valor das parcelas em aberto conforme a nova quantidade de vidas
    // (titular + dependentes ativos, incluindo o recém-incluído)
    await recalcularParcelasAbertas(titularConta + depsAtivos.length + 1);
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
    // Remove automaticamente eventual Taxa de inclusão ainda PENDENTE
    // vinculada a este dependente. Taxas já pagas permanecem para não
    // sumir com histórico financeiro. Vínculo pelo texto de `observacoes`
    // ("Taxa de inclusão de dependente — <NOME>"), gravado no lançamento.
    const alvoNome = excAlvo.paciente_nome;
    const { data: taxasPend } = await supabase
      .from("contrato_mensalidades")
      .select("id, observacoes")
      .eq("contrato_id", contrato.id)
      .eq("status", "pendente")
      .lt("numero_parcela", 0);
    const idsRemover = ((taxasPend ?? []) as Array<{ id: string; observacoes: string | null }>)
      .filter((r) => (r.observacoes ?? "").includes(alvoNome))
      .map((r) => r.id);
    if (idsRemover.length > 0) {
      const { error: eDel } = await supabase
        .from("contrato_mensalidades")
        .delete()
        .in("id", idsRemover);
      if (eDel) {
        toast.error("Dependente excluído, mas houve falha ao remover a taxa de inclusão pendente.");
      } else {
        toast.info(`Taxa de inclusão pendente removida (${idsRemover.length}).`);
      }
    }
    toast.success("Dependente excluído");
    const alvo = { ...excAlvo, ativo: false, excluido_em: hoje };
    setExcAlvo(null);
    // Recalcula valor das parcelas em aberto conforme nova qtd de vidas
    // (titular = 1 + dependentes ativos restantes = depsAtivos.length - 1)
    await recalcularParcelasAbertas(titularConta + Math.max(0, depsAtivos.length - 1));
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
        <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap justify-center">
          <span>Contrato #{contrato.numero} — {contrato.paciente_nome}</span>
          <ProntuarioBadge codigo={pacienteFull?.codigo_prontuario} />
        </h1>
        <div>
          {!cancelado && podeEscrever ? (
            <div className="flex items-center gap-2">
              {(() => {
                const parcelasMensais = mens.filter((m) => !isEncargoAvulso(m));
                const podeRenovar =
                  parcelasMensais.length > 0 &&
                  parcelasMensais.every((m) => m.status === "pago");
                const contratoJaRenovado = !!renovadoEm || (contrato as any).status === "renovado";
                if (!podeRenovar && !contratoJaRenovado) return null;
                if (contratoJaRenovado) {
                  const textoRenovacao = renovadoEm
                    ? `Renovado em ${fmtD(renovadoEm)}`
                    : "Contrato já renovado";
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex" tabIndex={0}>
                            <Button
                              size="sm"
                              disabled
                              className="bg-red-600 text-white opacity-60 cursor-not-allowed"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" /> RENOVAÇÃO
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{textoRenovacao}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                }
                return (
                  <Button
                    size="sm"
                    onClick={() => setRenovarOpen(true)}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" /> RENOVAÇÃO
                  </Button>
                );
              })()}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTrocarConvenioOpen(true)}
                className="border-amber-600 text-amber-700 hover:bg-amber-50"
                title="Cancelar este contrato para o paciente aderir a outro convênio, sem taxa de adesão nem carência."
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Trocar convênio
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4 mr-1" /> Cancelar contrato
              </Button>
            </div>
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
              <TabsTrigger value="historico">Histórico</TabsTrigger>
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
              {apenasFinanceiro ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 flex-wrap">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Titular financeiro</strong> — {contrato.paciente_nome} paga o plano, mas <strong>não utiliza</strong> os benefícios. Não conta na quantidade de vidas do contrato.
                  </span>
                  <ProntuarioBadge codigo={pacienteFull?.codigo_prontuario} />
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
              {temCiclosMultiplos ? (
                <div className="rounded-md border">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Ciclos anteriores deste contrato
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ciclosAnteriores.length}{" "}
                      {ciclosAnteriores.length === 1 ? "ciclo" : "ciclos"}
                    </div>
                  </div>
                  <div className="overflow-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ciclo</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead>Parcelas pagas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ciclosAnteriores.map((c) => {
                          const pagasCiclo = c.parcelas.filter((m) => m.status === "pago").length;
                          return (
                            <TableRow key={c.index}>
                              <TableCell className="font-medium">{c.label}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {c.tipo === "original" ? "Original" : "Renovação por extensão"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {c.inicio ? fmtD(c.inicio) : "—"} — {c.fim ? fmtD(c.fim) : "—"}
                              </TableCell>
                              <TableCell>
                                {c.parcelas.length > 0
                                  ? `${pagasCiclo}/${c.parcelas.length}`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                    Cada ciclo mantém sua própria contagem de 12 parcelas. O card "Pagas" acima reflete apenas o ciclo atual.
                  </div>
                </div>
              ) : null}
              {contratosAnteriores.length > 0 ? (
                <div className="rounded-md border">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Contratos anteriores deste paciente
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {contratosAnteriores.length}{" "}
                      {contratosAnteriores.length === 1 ? "contrato" : "contratos"}
                    </div>
                  </div>
                  <div className="overflow-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nº contrato</TableHead>
                          <TableHead>Convênio</TableHead>
                          <TableHead>Início</TableHead>
                          <TableHead>Término</TableHead>
                          <TableHead>Parcelas pagas</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contratosAnteriores.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono text-xs">
                              {c.numero ?? "—"}
                            </TableCell>
                            <TableCell>{c.convenio ?? "—"}</TableCell>
                            <TableCell>{c.data_inicio ? fmtD(c.data_inicio) : "—"}</TableCell>
                            <TableCell>{c.data_termino ? fmtD(c.data_termino) : "—"}</TableCell>
                            <TableCell>
                              {c.parcelas > 0 ? `${c.pagas}/${c.parcelas}` : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {c.status ?? "—"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                    Cada contrato mantém sua própria contagem de parcelas. Recebimentos avulsos históricos ficam no card "Recebido".
                  </div>
                </div>
              ) : null}
              {/* A antiga faixa "Taxa de adesão" foi movida para dentro da
                  tabela de Mensalidades como uma linha regular, com botão
                  próprio de pagamento (gera lançamento financeiro e caixa). */}
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
                    <div className="flex items-center gap-2">
                      {totalRascunhos > 0 ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={descartarRascunhos}
                            disabled={salvandoRascunhos}
                          >
                            Descartar
                          </Button>
                          <Button
                            size="sm"
                            onClick={salvarRascunhos}
                            disabled={salvandoRascunhos}
                          >
                            {salvandoRascunhos ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3 mr-1" />
                            )}
                            Salvar alterações ({totalRascunhos})
                          </Button>
                        </>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={adicionarParcela}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar parcela
                      </Button>
                    </div>
                  ) : null}
                </div>
                {podeEscrever && !(cancelado && !isAdmin) ? (() => {
                  const selecionaveis = mens.filter(
                    (m) => m.status !== "pago" && !(isAdesao(m) && adesaoEmbutida),
                  );
                  const selecionadas = selecionaveis.filter((m) => selectedHistIds.has(m.id));
                  const total = selecionadas.reduce((s, m) => s + (Number(m.valor) || 0), 0);
                  if (selecionadas.length === 0) return null;
                  return (
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                      <div>
                        <strong>{selecionadas.length}</strong> parcela(s) selecionada(s) — Total{" "}
                        <strong>R$ {total.toFixed(2).replace(".", ",")}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={limparHistSel}
                          disabled={aplicandoHistLote}
                        >
                          Limpar seleção
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={marcarPagasHistoricasEmLote}
                          disabled={aplicandoHistLote}
                        >
                          {aplicandoHistLote ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : null}
                          Marcar selecionadas como Paga (histórica)
                        </Button>
                      </div>
                    </div>
                  );
                })() : null}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {podeEscrever && !(cancelado && !isAdmin) ? (
                          <TableHead className="w-8">
                            {(() => {
                              const selecionaveis = mens.filter(
                                (m) => m.status !== "pago" && !(isAdesao(m) && adesaoEmbutida),
                              );
                              const allSel = selecionaveis.length > 0 &&
                                selecionaveis.every((m) => selectedHistIds.has(m.id));
                              const someSel = selecionaveis.some((m) => selectedHistIds.has(m.id));
                              return (
                                <input
                                  type="checkbox"
                                  aria-label="Selecionar todas as parcelas em aberto"
                                  ref={(el) => {
                                    if (el) el.indeterminate = !allSel && someSel;
                                  }}
                                  checked={allSel}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedHistIds(new Set(selecionaveis.map((m) => m.id)));
                                    } else {
                                      limparHistSel();
                                    }
                                  }}
                                />
                              );
                            })()}
                          </TableHead>
                        ) : null}
                        <TableHead>Cobrança</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pago em</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={podeEscrever && !(cancelado && !isAdmin) ? 8 : 7} className="text-center py-4 text-muted-foreground">
                            Carregando…
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {linhasCobranca.map((m) => {
                        // Cabeçalho de ciclo antes da 1ª parcela de cada ciclo
                        // subsequente ao original. Só aparece quando há
                        // renovação por extensão (temCiclosMultiplos).
                        let cicloHeader: ReactNode = null;
                        if (temCiclosMultiplos && (m.numero_parcela ?? 0) > 0) {
                          const ciclo = ciclos.find((c) =>
                            c.parcelas.some((p) => p.id === m.id),
                          );
                          if (ciclo && ciclo.index > 0 && ciclo.parcelas[0]?.id === m.id) {
                            cicloHeader = (
                              <TableRow key={`hdr-${ciclo.index}`} className="bg-muted/40">
                                <TableCell colSpan={podeEscrever && !(cancelado && !isAdmin) ? 8 : 7} className="text-xs font-semibold py-2">
                                  {ciclo.label} — {ciclo.inicio ? fmtD(ciclo.inicio) : "—"} a {ciclo.fim ? fmtD(ciclo.fim) : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          } else if (ciclo && ciclo.index === 0 && ciclo.parcelas[0]?.id === m.id) {
                            cicloHeader = (
                              <TableRow key={`hdr-${ciclo.index}`} className="bg-muted/40">
                                <TableCell colSpan={podeEscrever && !(cancelado && !isAdmin) ? 8 : 7} className="text-xs font-semibold py-2">
                                  {ciclo.label} — {ciclo.inicio ? fmtD(ciclo.inicio) : "—"} a {ciclo.fim ? fmtD(ciclo.fim) : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          }
                        }
                        return (
                        <Fragment key={m.id}>
                        {cicloHeader}
                        <TableRow>
                          {podeEscrever && !(cancelado && !isAdmin) ? (
                            <TableCell className="w-8">
                              {m.status !== "pago" && !(isAdesao(m) && adesaoEmbutida) ? (
                                <input
                                  type="checkbox"
                                  aria-label="Selecionar parcela para pagamento histórico"
                                  checked={selectedHistIds.has(m.id)}
                                  onChange={() => toggleHistSel(m.id)}
                                />
                              ) : null}
                            </TableCell>
                          ) : null}
                          <TableCell>
                            {isAdesao(m) ? (
                              <Badge variant="secondary">Adesão</Badge>
                            ) : isTaxaInclusao(m) ? (
                              <Badge
                                variant="secondary"
                                title={
                                  (m as unknown as { observacoes?: string | null }).observacoes ??
                                  "Taxa de inclusão de dependente"
                                }
                              >
                                Taxa inclusão
                              </Badge>
                            ) : (
                              temCiclosMultiplos && parcelaLocalPorId[m.id]
                                ? `${parcelaLocalPorId[m.id].pos}/${parcelaLocalPorId[m.id].total}`
                                : m.numero_parcela
                            )}
                          </TableCell>
                          <TableCell>
                            {isAdmin && podeEscrever ? (
                              <DateInputBR
                                className="h-8 w-40"
                                value={rascunhos[m.id]?.vencimento ?? m.vencimento}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v) setRascunho(m.id, { vencimento: v });
                                }}
                              />
                            ) : (
                              fmtD(m.vencimento)
                            )}
                          </TableCell>
                          <TableCell className="capitalize">
                            {competenciaDe(rascunhos[m.id]?.vencimento ?? m.vencimento)}
                          </TableCell>
                          <TableCell>
                            {isAdmin && podeEscrever ? (
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                className="h-8 w-28"
                                key={`valor-${m.id}-${rascunhos[m.id] ? "d" : "o"}`}
                                defaultValue={Number(
                                  rascunhos[m.id]?.valor ?? m.valor ?? 0,
                                ).toFixed(2)}
                                onChange={(e) => {
                                  const v = Number(String(e.target.value).replace(",", "."));
                                  if (Number.isFinite(v)) setRascunho(m.id, { valor: v });
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
                          <TableCell>
                            {isAdmin && podeEscrever ? (
                              <DateInputBR
                                className="h-8 w-40"
                                value={
                                  rascunhos[m.id] && "pago_em" in rascunhos[m.id]!
                                    ? rascunhos[m.id]!.pago_em ?? ""
                                    : m.pago_em ?? ""
                                }
                                onChange={(e) => {
                                  const v = e.target.value || null;
                                  setRascunho(m.id, { pago_em: v });
                                }}
                              />
                            ) : (
                              fmtD(m.pago_em)
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              {podeEscrever && (m.status === "pago" ? (
                                <>
                                  {m.lancamento_id ? (
                                    nfsePorLancamento[m.lancamento_id] ? (
                                      <a
                                        href={nfsePorLancamento[m.lancamento_id].pdf_url ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs inline-flex items-center gap-1 rounded-md border px-2 h-8 hover:bg-muted"
                                        title={`NFS-e ${nfsePorLancamento[m.lancamento_id].numero ?? "emitida"} — ${nfsePorLancamento[m.lancamento_id].status ?? ""}`}
                                      >
                                        <FileText className="h-3 w-3" />
                                        NFS-e {nfsePorLancamento[m.lancamento_id].numero ?? ""}
                                      </a>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        title="Emitir NFS-e desta parcela"
                                        disabled={nfseEmitindoId === m.id}
                                        onClick={() => emitirNfseParcela(m)}
                                      >
                                        {nfseEmitindoId === m.id ? (
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                          <FileText className="h-3 w-3 mr-1" />
                                        )}
                                        NFS-e
                                      </Button>
                                    )
                                  ) : (
                                    <span className="text-xs text-muted-foreground" title="Parcela paga fora do sistema — não gera NFS-e">—</span>
                                  )}
                                  <Button size="sm" variant="outline" onClick={() => reverterMensalidade(m)}>
                                    Reverter
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {isAdesao(m) && adesaoEmbutida ? (
                                    <span
                                      className="text-xs text-muted-foreground italic"
                                      title="A adesão é cobrada junto com a 1ª mensalidade enquanto ela estiver pendente."
                                    >
                                      Cobrada com a 1ª parcela
                                    </span>
                                  ) : (
                                    <>
                                      <Button size="sm" disabled={cancelado && !isAdmin} onClick={() => abrirFormaPag(m)}>
                                        <Check className="h-3 w-3 mr-1" />
                                        Pagar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        title="Marcar como paga historicamente (sem lançar no caixa)"
                                        disabled={cancelado && !isAdmin}
                                        onClick={() => marcarPagaHistorica(m)}
                                      >
                                        Paga (histórica)
                                      </Button>
                                    </>
                                  )}
                                </>
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
                        </Fragment>
                        );
                      })}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label>Paciente titular</Label>
                    <ProntuarioBadge
                      codigo={admPaciente?.codigo_prontuario ?? pacienteFull?.codigo_prontuario}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] items-start">
                    <div className="min-w-0">
                      <PatientSearchInput
                        value={admPaciente}
                        onSelect={(p) => setAdmPaciente(p)}
                        placeholder="Buscar paciente por nome ou CPF…"
                      />
                    </div>
                    <div className="md:min-w-[260px] md:max-w-[340px]">
                      <ApenasFinanceiroToggle
                        contratoId={contrato.id}
                        checked={apenasFinanceiro}
                        saving={savingApenasFin}
                        disabled={cancelado && !isAdmin}
                        onChange={async (v) => {
                      setSavingApenasFin(true);
                      const { error } = await supabase
                        .from("contratos_assinatura")
                        .update({ titular_apenas_financeiro: v } as any)
                        .eq("id", contrato.id);
                      if (error) {
                        setSavingApenasFin(false);
                        mostrarErro(error);
                        return;
                      }
                      (contrato as any).titular_apenas_financeiro = v;
                      setApenasFinanceiro(v);
                      const novoTotal = (v ? 0 : 1) + depsAtivos.length;
                      await recalcularParcelasAbertas(novoTotal);
                      setSavingApenasFin(false);
                      toast.success(v
                        ? "Marcado como Titular financeiro (não utiliza os benefícios)."
                        : "Titular passa a usufruir dos benefícios normalmente.");
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-medium">Paciente titular</div>
                      <ProntuarioBadge codigo={pacienteFull?.codigo_prontuario} />
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
                      <span>{contrato.paciente_nome}{pacienteFull?.cpf ? ` — CPF ${pacienteFull.cpf}` : ""}</span>
                      <ProntuarioBadge codigo={pacienteFull?.codigo_prontuario} />
                    </div>
                  </div>
                  {apenasFinanceiro ? (
                    <div className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <Info className="h-3.5 w-3.5" /> Titular financeiro — não utiliza os benefícios.
                    </div>
                  ) : null}
                </>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  <Select
                    value={admFaixaId}
                    onValueChange={(id) => {
                      setAdmFaixaId(id);
                      // Ao trocar a faixa, reflete o valor no input "Valor mensal"
                      // para que "Salvar valor e vencimento" persista corretamente.
                      const f = faixas.find((x) => x.id === id);
                      if (f) setEditValor(Number(f.valor_mensal).toFixed(2));
                    }}
                  >
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
                  {admFaixaId === "" && Number(valorMensalAtual) > 0 ? (
                    <p className="text-xs text-amber-600">
                      O valor atual ({BRL(Number(valorMensalAtual))}) não corresponde a nenhuma faixa deste convênio (possível tabela antiga). Selecione uma faixa para alinhar o valor ou edite manualmente o campo "Valor mensal" ao lado.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Ao salvar, o valor mensal do contrato e das parcelas em aberto serão atualizados para a faixa selecionada.
                    </p>
                  )}
                </div>
              ) : (
                <DadosField label="Nº de pessoas no contrato" value={faixaLabel} />
              )}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {isAdmin && podeEscrever ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Data início</div>
                    <DateInputBR
                      value={admDataInicio}
                      onChange={(e) => setAdmDataInicio(e.target.value)}
                    />
                  </div>
                ) : (
                  <DadosField label="Data início" value={fmtD(contrato.data_inicio)} />
                )}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Data término</div>
                  <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-semibold text-sm">
                    {fmtD(contrato.data_fim ?? addUmAno(admDataInicio || contrato.data_inicio))}
                  </div>
                </div>
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
                    {depsAtivos.length >= maxDep && (
                      <span className="ml-2 text-xs font-normal text-amber-600">
                        Limite da faixa atingido. Aumente a faixa ou marque o titular como apenas financeiro.
                      </span>
                    )}
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
                        onClick={() => {
                          const hoje = new Date().toISOString().slice(0, 10);
                          const dataInicioIso = (contrato.data_inicio ?? "").slice(0, 10);
                          const mesmoDiaVenda = !!dataInicioIso && dataInicioIso === hoje;
                          const valorPadrao = Number(convenio?.taxa_inclusao_dependente ?? 0) || 0;
                          setIncCobrarTaxa(!mesmoDiaVenda);
                          setIncTaxaValor(valorPadrao.toFixed(2));
                          setIncTaxaVenc(hoje);
                          setIncOpen(true);
                        }}
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
                            {d.codigo_prontuario ? (
                              <span className="ml-2 no-underline align-middle inline-block">
                                <ProntuarioBadge codigo={d.codigo_prontuario} />
                              </span>
                            ) : null}
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
              {podeEditarCarencia ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      id={`sem-carencia-${contrato.id}`}
                      type="checkbox"
                      className="mt-0.5"
                      checked={semCarencia}
                      disabled={savingSemCarencia}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setSemCarencia(v);
                        if (!v) void salvarSemCarencia(false, "");
                      }}
                    />
                    <label htmlFor={`sem-carencia-${contrato.id}`} className="text-sm cursor-pointer">
                      <span className="font-medium">Isento de carência</span>
                      <span className="text-muted-foreground"> — marcar quando o contrato veio de renovação histórica (tabela antiga) ou migração e o paciente já cumpriu carência em contrato anterior.</span>
                    </label>
                  </div>
                  {semCarencia ? (
                    <div className="space-y-2 pl-6">
                      <div className="space-y-1">
                        <Label className="text-xs">Motivo (obrigatório)</Label>
                        <Input
                          value={semCarenciaMotivo}
                          onChange={(e) => setSemCarenciaMotivo(e.target.value)}
                          placeholder="Ex.: Renovação de contrato migrado da tabela antiga"
                          disabled={savingSemCarencia}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => salvarSemCarencia(true, semCarenciaMotivo)}
                          disabled={savingSemCarencia || !semCarenciaMotivo.trim()}
                        >
                          {savingSemCarencia ? "Salvando…" : "Confirmar isenção"}
                        </Button>
                        {(contrato as any).sem_carencia_em ? (
                          <span className="text-xs text-muted-foreground">
                            Marcado em {fmtD(String((contrato as any).sem_carencia_em).slice(0, 10))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (contrato as any).sem_carencia ? (
                <DadosField
                  label="Carência"
                  value={`Isento — ${(contrato as any).sem_carencia_motivo ?? "sem motivo registrado"}`}
                />
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
            <TabsContent value="historico" className="mt-4">
              <HistoricoContratoTab contratoId={contrato.id} />
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
                  const idsCicloAtual = new Set(
                    (cicloAtual?.parcelas ?? []).map((p) => p.id),
                  );
                  const list =
                    drill === "areceber"
                      ? mens.filter((m) => m.status !== "pago")
                      : drill === "pagas"
                        ? (temCiclosMultiplos
                            ? mens.filter((m) => m.status === "pago" && idsCicloAtual.has(m.id))
                            : mens.filter((m) => m.status === "pago"))
                        : drill === "recebido"
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
          {drill === "recebido" && extraRecebido.count > 0 ? (
            <div className="text-xs text-muted-foreground">
              + {extraRecebido.count} recebimento(s) avulso(s) históricos totalizando {BRL(extraRecebido.total)}.
              Não são parcelas deste contrato.
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
          {pagMens && pagDiasAtraso > 0 && pagDiasAtraso <= 5 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <div className="font-semibold">Dentro da tolerância — sem encargos</div>
              <div className="text-muted-foreground">
                Parcela vencida há {pagDiasAtraso} dia(s). Até 5 dias corridos após o vencimento não incidem multa nem juros.
              </div>
            </div>
          ) : null}
          {pagMens && pagDiasAtraso > 5 ? (
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
            ? isAdesao(pagMens)
              ? `Taxa de adesão — Contrato #${contrato.numero} — ${contrato.paciente_nome}`
              : isTaxaInclusao(pagMens)
                ? `Taxa de inclusão de dependente — Contrato #${contrato.numero} — ${contrato.paciente_nome}`
                : `Mensalidade ${pagMens.numero_parcela}/${mensalidades.length} - Contrato #${contrato.numero} - ${contrato.paciente_nome}`
            : ""
        }
        initialValor={pagMens ? pagValorFinal.toFixed(2) : ""}
        initialFormaPagamento={pagInitialForma}
        categoriaFixaNome={
          pagMens && isAdesao(pagMens)
            ? "TAXA DE ADESAO CARTAO"
            : pagMens && isTaxaInclusao(pagMens)
              ? "DEPENDENTE / ADESAO CARTAO"
              : "MENSALIDADE CARTAO CONSULTA"
        }
        onSavedWithData={async (dados) => {
          if (!pagMens || !clinicaAtual) return;
          const mensId = pagMens.id;
          const taxaAdesao = Number(pagMens.taxa_adesao ?? 0) || 0;
          const ehAdesaoAvulsa = isAdesao(pagMens);
          const ehTaxaInclusao = isTaxaInclusao(pagMens);
          // Repassa a data escolhida no diálogo (retroativa ou não) como
          // `pago_em` — a RPC já usou essa mesma data para o lançamento e o
          // movimento de caixa; a mensalidade precisa ficar coerente.
          await marcarPago(
            mensId,
            true,
            dados.forma_pagamento ?? "misto",
            dados.lancamento_id,
            dados.valor,
            dados.data,
          );
          // Pagamentos avulsos da linha de adesão ou da taxa de inclusão de
          // dependente: o próprio LancamentoDialog já gravou lançamento +
          // movimento de caixa via RPC atômica com a categoria correta. Não
          // há segunda cobrança nem GR de mensalidade a imprimir.
          if (ehAdesaoAvulsa || ehTaxaInclusao) {
            toast.success("Pagamento registrado.");
            setPagMens(null);
            setPagInitialForma("");
            return;
          }
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
                // Abordagem B: RPC atômica lançamento + caixa (Postgres cuida do rollback).
                // Segue a mesma data escolhida no diálogo (permite retroativo):
                // se o operador pagou 20/07, tanto a mensalidade quanto a taxa
                // de adesão vinculada vão para 20/07 no financeiro e no caixa.
                const dataLanc = dados.data || new Date().toISOString().slice(0, 10);
                const descricaoTaxa = `Taxa de adesão — Contrato #${contrato.numero} — ${contrato.paciente_nome}`;
                const { data: rpcData, error: rpcErr } = await supabase.rpc("fn_registrar_lancamento_e_caixa", {
                  p_lancamento: {
                    clinica_id: clinicaAtual.clinica_id,
                    tipo: "receita",
                    descricao: descricaoTaxa,
                    valor: taxaAdesao,
                    data: dataLanc,
                    status: "confirmado",
                    categoria_id: categoriaTaxaId,
                    forma_pagamento: dados.forma_pagamento,
                    bandeira_cartao: dados.bandeira_cartao,
                    parcelas: dados.parcelas,
                    paciente_id: (contrato as { paciente_id?: string | null }).paciente_id ?? null,
                    criado_por: user?.id ?? null,
                  },
                  p_movimento: user?.id
                    ? {
                        user_id: user.id,
                        user_nome: user?.user_metadata?.nome ?? user?.email ?? null,
                        tipo: "recebimento",
                        valor: taxaAdesao,
                        descricao: descricaoTaxa,
                        forma_pagamento: dados.forma_pagamento,
                      }
                    : null,
                } as never);
                if (rpcErr) {
                  toast.error(`Taxa de adesão: falha atômica (nada foi gravado). Detalhe: ${rpcErr.message ?? String(rpcErr)}`);
                  return;
                }

                // 3.5) A taxa de adesão tinha lançamento + caixa próprios (RPC
                // acima), mas a linha correspondente em contrato_mensalidades
                // (numero_parcela=0) nunca era marcada como paga — ficava
                // "pendente" para sempre, ao contrário da mensalidade normal
                // (que já grava status/lancamento_id/valor_pago). Padroniza o
                // mesmo nível de vínculo financeiro para as duas.
                const taxaRpcResult = (rpcData ?? {}) as { lancamento_id?: string };
                const taxaMensRow = mens.find((m) => isAdesao(m));
                if (taxaMensRow) {
                  await marcarPago(
                    taxaMensRow.id,
                    true,
                    dados.forma_pagamento ?? "misto",
                    taxaRpcResult.lancamento_id ?? null,
                    taxaAdesao,
                    dataLanc,
                  );
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

      {/* Diálogos usados pela emissão de NFS-e a partir das parcelas */}
      {tomadorNfseDialog}
      {descricaoNfseDialog}

      <Dialog
        open={incOpen}
        onOpenChange={(v) => {
          setIncOpen(v);
          if (v) {
            // Regra: só NÃO cobrar quando a inclusão é feita no mesmo dia
            // da venda (data_inicio do contrato). Nos demais casos, taxa vem
            // marcada. Valor sugerido: cb_convenios.taxa_inclusao_dependente
            // (0 quando ainda não configurado no convênio) — sempre editável.
            const hoje = new Date().toISOString().slice(0, 10);
            const dataInicioIso = (contrato.data_inicio ?? "").slice(0, 10);
            const mesmoDiaVenda = !!dataInicioIso && dataInicioIso === hoje;
            const valorPadrao = Number(convenio?.taxa_inclusao_dependente ?? 0) || 0;
            setIncCobrarTaxa(!mesmoDiaVenda);
            setIncTaxaValor(valorPadrao.toFixed(2));
            setIncTaxaVenc(hoje);
          }
        }}
      >
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
            <div className="rounded-md border p-3 space-y-2 bg-muted/20">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={incCobrarTaxa}
                  onCheckedChange={(v) => setIncCobrarTaxa(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Cobrar taxa de inclusão de dependente</span>
                  <span className="block text-xs text-muted-foreground">
                    Cobrança única — aparece em <strong>Mensalidades</strong> mas não conta como parcela.
                  </span>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input
                    type="text"
                    value={BRL(Number(String(incTaxaValor).replace(",", ".")) || 0)}
                    readOnly
                    disabled={!incCobrarTaxa}
                    tabIndex={-1}
                    className="bg-muted/50 cursor-not-allowed"
                    title="Valor definido no cadastro do convênio"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vencimento</Label>
                  <DateInputBR
                    value={incTaxaVenc}
                    onChange={(e) => setIncTaxaVenc(e.target.value)}
                    disabled={!incCobrarTaxa}
                  />
                </div>
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
      <RenovarContratoDialog
        open={renovarOpen}
        onOpenChange={setRenovarOpen}
        contratoId={contrato.id}
        clinicaId={(contrato as any).clinica_id}
        convenioAtualId={contrato.convenio_id ?? null}
        convenioAtualNome={convenio?.nome ?? null}
        valorAtual={Number(contrato.valor_mensal ?? 0)}
        onRenovado={(r) => {
          setRenovadoEm(new Date().toISOString());
          if (r.tipo === "troca_plano" && r.contratoNovoId) {
            onBack();
          } else {
            load();
          }
        }}
      />
      <RenovarContratoDialog
        open={trocarConvenioOpen}
        onOpenChange={setTrocarConvenioOpen}
        contratoId={contrato.id}
        clinicaId={(contrato as any).clinica_id}
        convenioAtualId={contrato.convenio_id ?? null}
        convenioAtualNome={convenio?.nome ?? null}
        valorAtual={Number(contrato.valor_mensal ?? 0)}
        modo="troca_convenio"
        onRenovado={() => {
          // O contrato atual foi cancelado; volta para a lista para abrir o novo.
          onBack();
        }}
      />
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