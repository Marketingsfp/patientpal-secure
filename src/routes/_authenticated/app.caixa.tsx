import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
<<<<<<< HEAD
  Wallet,
  PlusCircle,
  MinusCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Lock,
  Unlock,
  Eye,
  FileDown,
  Users,
  Receipt,
  ChevronRight,
  Trash2,
  Plus,
  HandCoins,
  ArrowRight,
  Undo2,
  Printer,
=======
  Wallet, PlusCircle, MinusCircle, ArrowDownToLine, ArrowUpFromLine, Lock,
  Unlock, Eye, FileDown, Users, Receipt, ChevronRight, Trash2, Plus, HandCoins, ArrowRight, Undo2, Printer, CalendarIcon, X, Search,
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SolicitarEstornoDialog } from "@/components/financeiro/SolicitarEstornoDialog";
import { useCaixaV2Flag } from "@/hooks/use-caixa-v2-flag";
import { CaixaV2Mount } from "@/components/caixa-v2/caixa-v2-mount";
import { printComprovanteCaixa } from "@/lib/print-caixa-comprovante";

export const Route = createFileRoute("/_authenticated/app/caixa")({
  component: CaixaRouteDispatcher,
  head: () => ({ meta: [{ title: "Caixa — ClinicaOS" }] }),
});

/**
 * Normaliza o valor gravado em `caixa_movimentos.forma_pagamento` para os
 * buckets exibidos no painel (Dinheiro / PIX / Débito / Crédito / Boleto /
 * Transferência / Convênio). Aliases: `cartao_credito`/`cartao_debito` do
 * banco viram `credito`/`debito`. Retorna `misto` para pagamentos divididos
 * (que são decompostos depois consultando `fin_lancamentos.observacoes`) e
 * `outros` como residual.
 */
const FORMA_BUCKETS = ["dinheiro", "pix", "debito", "credito", "boleto", "transferencia", "convenio"] as const;
type FormaBucket = typeof FORMA_BUCKETS[number] | "misto" | "outros";

function normalizarForma(f: string | null | undefined): FormaBucket {
  const k = (f ?? "").toLowerCase().trim();
  if (!k) return "outros";
  if (k === "dinheiro" || k === "pix" || k === "boleto" || k === "transferencia" || k === "convenio" || k === "misto") return k;
  if (k === "credito" || k === "cartao_credito" || k === "cartão_credito" || k === "cartao credito") return "credito";
  if (k === "debito" || k === "cartao_debito" || k === "cartão_debito" || k === "cartao debito") return "debito";
  return "outros";
}

/**
 * Extrai as parcelas de um pagamento misto a partir do trecho
 * `Pagamento misto: Dinheiro R$ 60,00; PIX R$ 50,00 | ...` gravado em
 * `fin_lancamentos.observacoes`. Retorna somas por bucket já normalizado.
 */
function decomporMistoObs(obs: string | null | undefined): Partial<Record<FormaBucket, number>> {
  const out: Partial<Record<FormaBucket, number>> = {};
  if (!obs) return out;
  const idx = obs.indexOf("Pagamento misto:");
  if (idx < 0) return out;
  const trecho = obs.slice(idx + "Pagamento misto:".length).split(" | ")[0];
  const partes = trecho.split(";").map((s) => s.trim()).filter(Boolean);
  const LABEL_TO_KEY: Array<[RegExp, FormaBucket]> = [
    [/^cart[ãa]o\s*cr[ée]dito/i, "credito"],
    [/^cart[ãa]o\s*d[ée]bito/i, "debito"],
    [/^cr[ée]dito/i, "credito"],
    [/^d[ée]bito/i, "debito"],
    [/^dinheiro/i, "dinheiro"],
    [/^pix/i, "pix"],
    [/^boleto/i, "boleto"],
    [/^conv[êe]nio/i, "convenio"],
    [/^transfer[êe]ncia/i, "transferencia"],
  ];
  const parseBRL = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  for (const p of partes) {
    const match = LABEL_TO_KEY.find(([re]) => re.test(p));
    if (!match) continue;
    const valMatch = p.match(/R\$\s*([\d.]+,\d{2})/);
    if (!valMatch) continue;
    const v = parseBRL(valMatch[1]);
    out[match[1]] = (out[match[1]] ?? 0) + v;
  }
  return out;
}

/**
 * Rótulo bonito para exibir a forma de pagamento em tabelas. Para
 * `misto`, converte as parcelas decompostas em algo como
 * "Dinheiro R$ 60,00 · PIX R$ 100,00". Sem observações do lançamento
 * ainda em cache, retorna "Misto (dividido)".
 */
const FORMA_LABEL: Record<FormaBucket, string> = {
  dinheiro: "Dinheiro", pix: "PIX", debito: "Cartão débito", credito: "Cartão crédito",
  boleto: "Boleto", transferencia: "Transferência", convenio: "Convênio",
  misto: "Misto", outros: "Outros",
};
function formatarFormaPagamento(
  m: { forma_pagamento: string | null; lancamento_id?: string | null },
  mistoObs: Record<string, string>,
): string {
  const bucket = normalizarForma(m.forma_pagamento);
  if (bucket !== "misto") return m.forma_pagamento || "—";
  const obs = m.lancamento_id ? mistoObs[m.lancamento_id] : undefined;
  const partes = obs ? decomporMistoObs(obs) : {};
  const entradas = Object.entries(partes).filter(([, v]) => (v ?? 0) > 0);
  if (entradas.length === 0) return "Misto (dividido)";
  return entradas
    .map(([k, v]) => `${FORMA_LABEL[k as FormaBucket] ?? k} ${(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`)
    .join(" · ");
}

/**
 * Promoção controlada do CaixaShellV2 para `/app/caixa`, atrás da flag
 * `caixa_v2` E limitado a admin/gestor. Recepção, caixa, médico, financeiro
 * e demais perfis continuam vendo o `<Page />` clássico intocado — mesmo
 * com a flag ligada. Kill-switch imediato: desligar a flag no perfil
 * volta para o clássico sem reload (o hook escuta `caixa:flag-changed`).
 *
 * Este dispatcher é o ÚNICO ponto novo; nenhuma linha do fluxo clássico
 * (cobrança, estorno, recibo, NFS-e, splits, abertura/fechamento) muda.
 */
function CaixaRouteDispatcher() {
  const { clinicaAtual } = useClinica();
  const { enabled, loading } = useCaixaV2Flag();
  const role = clinicaAtual?.role ?? null;
  const v2Allowed = role === "admin" || role === "gestor";
  if (!loading && enabled && v2Allowed) return <CaixaV2Mount />;
  return <Page />;
}

type MovTipo = "abertura" | "sangria" | "suprimento" | "recebimento" | "despesa" | "fechamento";
interface Sessao {
  id: string;
  clinica_id: string;
  user_id: string;
  user_nome: string | null;
  aberto_em: string;
  valor_abertura: number;
  fechado_em: string | null;
  valor_fechamento_informado: number | null;
  valor_fechamento_calculado: number | null;
  diferenca: number | null;
  status: "aberto" | "fechado";
  observacoes: string | null;
}
interface Mov {
  id: string;
  sessao_id: string;
  user_id: string;
  tipo: MovTipo;
  valor: number;
  descricao: string | null;
  forma_pagamento: string | null;
  created_at: string;
  lancamento_id?: string | null;
}
interface FilaCaixa {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;
  medico_nome: string | null;
  valor: number;
  valor_cartao: number;
  ja_pago: boolean;
}

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDT = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const TIPO_LABEL: Record<MovTipo, string> = {
  abertura: "Abertura",
  sangria: "Sangria",
  suprimento: "Suprimento",
  recebimento: "Recebimento",
  despesa: "Despesa",
  fechamento: "Fechamento",
};
const TIPO_SINAL: Record<MovTipo, 1 | -1 | 0> = {
  abertura: 1,
  suprimento: 1,
  recebimento: 1,
  sangria: -1,
  despesa: -1,
  fechamento: 0,
};
const TIPO_CLASS: Record<MovTipo, string> = {
  abertura:
    "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  suprimento:
    "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  recebimento:
    "bg-green-100 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  sangria:
    "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  despesa:
    "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  fechamento:
    "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
};

const SESSAO_FIELDS =
  "id, clinica_id, user_id, user_nome, aberto_em, valor_abertura, fechado_em, valor_fechamento_informado, valor_fechamento_calculado, diferenca, status, observacoes";
const MOV_FIELDS =
  "id, sessao_id, user_id, tipo, valor, descricao, forma_pagamento, created_at, lancamento_id";

/** Extrai o nome do serviço da descrição de um movimento como fallback, quando
 *  não há enriquecimento via fin_lancamentos/agendamento. */
function servicoFromDescricao(desc: string | null): string | null {
  if (!desc) return null;
  // Remove prefixo "Recebimento — " para facilitar o parse
  const clean = desc.replace(/^Recebimento\s+—\s+/i, "");
  // Padrão 1: "PACIENTE (SERVIÇO)" — texto entre parênteses no final
  const par = clean.match(/\(([^()]+)\)\s*$/);
  if (par) return par[1].trim() || null;
  // Padrão 2: separado por " — " ou " · "
  const idx = Math.max(clean.lastIndexOf(" — "), clean.lastIndexOf(" · "));
  if (idx > 0) {
    return clean.slice(idx + 3).replace(/\s*\(.*\)\s*$/, "").trim() || null;
  }
  return null;
}

const BANDEIRAS_CARTAO = [
  "Visa",
  "Mastercard",
  "Elo",
  "Hipercard",
  "American Express",
  "Diners",
  "Outra",
];

function montarSufixoCartao(forma: string, bandeira: string, parcelas: string): string {
  if (forma === "debito" && bandeira) return ` · ${bandeira.toUpperCase()} (DÉBITO)`;
  if (forma === "credito" && bandeira) {
    const n = Math.max(1, Number(parcelas) || 1);
    return ` · ${bandeira.toUpperCase()} ${n}x`;
  }
  return "";
}

function Page() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("caixa");
  const isManager = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";

  const [tab, setTab] = useState<"meu" | "todos" | "repasse">("meu");
  const [estornoFor, setEstornoFor] = useState<Mov | null>(null);
  const [caixaDrill, setCaixaDrill] = useState<null | "saldo" | "abertura" | "entradas" | "saidas">(
    null,
  );

  // ====== Resumo de repasse do dia (para a aba "Repasse") ======
  const [repHoje, setRepHoje] = useState<{
    pendente: number;
    pago: number;
    medicos: number;
    qtd_pend: number;
  }>({
    pendente: 0,
    pago: 0,
    medicos: 0,
    qtd_pend: 0,
  });
  const [repPagosHoje, setRepPagosHoje] = useState<
    Array<{ id: string; medico: string; valor: number; forma: string | null; hora: string | null }>
  >([]);
  const loadRepasseHoje = useCallback(async () => {
    if (!clinicaAtual) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("fin_lancamentos")
      .select("valor, medico_id, repasse_pago, agendamento_id, data")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("tipo", "receita")
      .gte("data", hoje)
      .lte("data", hoje)
      .not("agendamento_id", "is", null);
    if (error) return;
    const rows = (data ?? []) as Array<{
      valor: number | null;
      medico_id: string | null;
      repasse_pago: boolean | null;
    }>;
    let pendente = 0,
      pago = 0,
      qtd_pend = 0;
    const medSet = new Set<string>();
    for (const r of rows) {
      const v = Number(r.valor) || 0;
      if (r.repasse_pago) pago += v;
      else {
        pendente += v;
        qtd_pend++;
        if (r.medico_id) medSet.add(r.medico_id);
      }
    }
    setRepHoje({ pendente, pago, medicos: medSet.size, qtd_pend });
    // Lista de pagamentos de repasse realizados hoje (despesas "Repasse médico — ...")
    const { data: pagos } = await supabase
      .from("fin_lancamentos")
      .select("id, valor, medico_id, descricao, forma_pagamento, created_at, data")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("tipo", "despesa")
      .eq("data", hoje)
      .ilike("descricao", "Repasse médico%")
      .order("created_at", { ascending: false });
    const pagosRows = (pagos ?? []) as Array<{
      id: string;
      valor: number | null;
      medico_id: string | null;
      descricao: string | null;
      forma_pagamento: string | null;
      created_at: string | null;
    }>;
    const medIds = Array.from(
      new Set(pagosRows.map((p) => p.medico_id).filter(Boolean) as string[]),
    );
    const medMap = new Map<string, string>();
    if (medIds.length) {
      const { data: meds } = await supabase.from("medicos").select("id, nome").in("id", medIds);
      for (const m of (meds ?? []) as Array<{ id: string; nome: string }>) medMap.set(m.id, m.nome);
    }
    setRepPagosHoje(
      pagosRows.map((p) => ({
        id: p.id,
        medico: p.medico_id
          ? (medMap.get(p.medico_id) ?? "—")
          : p.descricao?.replace(/^Repasse médico\s*—\s*/, "").replace(/\s*\(.*\)$/, "") || "—",
        valor: Number(p.valor) || 0,
        forma: p.forma_pagamento,
        hora: p.created_at
          ? new Date(p.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null,
      })),
    );
  }, [clinicaAtual]);
  useEffect(() => {
    if (tab === "repasse") void loadRepasseHoje();
  }, [tab, loadRepasseHoje]);
  const [loading, setLoading] = useState(true);
  const [minhaSessao, setMinhaSessao] = useState<Sessao | null>(null);
  const [minhasMovs, setMinhasMovs] = useState<Mov[]>([]);
  const [minhasSessoes, setMinhasSessoes] = useState<Sessao[]>([]);
  // Solicitações de estorno vinculadas às movimentações visíveis
  // (chave = lancamento_id, valor = status). Usado para trocar o botão
  // "Solicitar estorno" por "Aguardando aprovação" (pendente) ou
  // "Estornado" (aprovado) conforme a decisão do financeiro.
  const [estornosPorLanc, setEstornosPorLanc] = useState<Map<string, "pendente" | "aprovado">>(new Map());
  const [enrichPorLanc, setEnrichPorLanc] = useState<Map<string, { servico: string | null; medico: string | null }>>(new Map());
  // Filtro de período para "Movimentos" (padrão: hoje)
  type PeriodoFiltro = "hoje" | "semana" | "quinzena" | "mes" | "intervalo" | "todos";
  const [meuPeriodo, setMeuPeriodo] = useState<PeriodoFiltro>("hoje");
  const [meuDataIni, setMeuDataIni] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [meuDataFim, setMeuDataFim] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [meuMedico, setMeuMedico] = useState<string>("__all__");
  const [meuPaciente, setMeuPaciente] = useState<string>("");
  const [openCal, setOpenCal] = useState(false);
  const minhasMovsFiltrados = useMemo<Mov[]>(() => {
    // 1) filtro de período (data)
    let base: Mov[] = minhasMovs;
    if (meuPeriodo !== "todos") {
      const now = new Date();
      const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      let ini: Date;
      let fimP: Date = fim;
      if (meuPeriodo === "hoje") {
        ini = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      } else if (meuPeriodo === "semana") {
        ini = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      } else if (meuPeriodo === "quinzena") {
        ini = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 0, 0, 0, 0);
      } else if (meuPeriodo === "mes") {
        ini = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      } else {
        const [yi, mi, di] = meuDataIni.split("-").map(Number);
        const [yf, mf, df] = meuDataFim.split("-").map(Number);
        ini = new Date(yi, (mi || 1) - 1, di || 1, 0, 0, 0, 0);
        fimP = new Date(yf, (mf || 1) - 1, df || 1, 23, 59, 59, 999);
      }
      base = base.filter((m) => {
        const d = new Date(m.created_at);
        return d >= ini && d <= fimP;
      });
    }
    // 2) filtro por médico (usa enrichPorLanc quando disponível)
    if (meuMedico && meuMedico !== "__all__") {
      base = base.filter((m) => {
        const enr = m.lancamento_id ? enrichPorLanc.get(m.lancamento_id) : undefined;
        return (enr?.medico ?? "").trim() === meuMedico;
      });
    }
    // 3) filtro por paciente (nome antes do " — " na descrição)
    const termo = meuPaciente.trim().toLocaleLowerCase("pt-BR");
    if (termo) {
      base = base.filter((m) => {
        const desc = (m.descricao ?? "").toLocaleLowerCase("pt-BR");
        return desc.includes(termo);
      });
    }
    return base;
  }, [minhasMovs, meuPeriodo, meuDataIni, meuDataFim, meuMedico, meuPaciente, enrichPorLanc]);

  // Lista de médicos distintos presentes nos movimentos carregados.
  const medicosDisponiveis = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const m of minhasMovs) {
      const enr = m.lancamento_id ? enrichPorLanc.get(m.lancamento_id) : undefined;
      const nome = (enr?.medico ?? "").trim();
      if (nome) set.add(nome);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [minhasMovs, enrichPorLanc]);

  const filtrosAtivos =
    meuPeriodo !== "hoje" || meuMedico !== "__all__" || meuPaciente.trim() !== "";
  const limparFiltros = () => {
    setMeuPeriodo("hoje");
    setMeuMedico("__all__");
    setMeuPaciente("");
    const hj = new Date().toISOString().slice(0, 10);
    setMeuDataIni(hj);
    setMeuDataFim(hj);
  };

  // Rótulo curto do período para mostrar no botão do calendário.
  const periodoLabel = useMemo(() => {
    if (meuPeriodo === "hoje") return "Hoje";
    if (meuPeriodo === "semana") return "Última semana";
    if (meuPeriodo === "quinzena") return "Última quinzena";
    if (meuPeriodo === "mes") return "Último mês";
    if (meuPeriodo === "todos") return "Todos";
    const p = (s: string) => {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    };
    return `${p(meuDataIni)} — ${p(meuDataFim)}`;
  }, [meuPeriodo, meuDataIni, meuDataFim]);

  const [todasSessoes, setTodasSessoes] = useState<Sessao[]>([]);
  const [todosMovs, setTodosMovs] = useState<Mov[]>([]);
  const [fIni, setFIni] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [fFim, setFFim] = useState(new Date().toISOString().slice(0, 10));
  const [fUserId, setFUserId] = useState<string>("");
  const [usersList, setUsersList] = useState<Array<{ user_id: string; nome: string }>>([]);

  // Modais
  const [openAbrir, setOpenAbrir] = useState(false);
  const [openMov, setOpenMov] = useState<{ tipo: MovTipo } | null>(null);
  const [openFechar, setOpenFechar] = useState(false);
  const [openDetalhe, setOpenDetalhe] = useState<Sessao | null>(null);
  const [detalheMovs, setDetalheMovs] = useState<Mov[]>([]);
  const [filaCaixa, setFilaCaixa] = useState<FilaCaixa[]>([]);
  const [openCobranca, setOpenCobranca] = useState<FilaCaixa | null>(null);
  type LinhaPag = { forma: string; valor: string; bandeira: string; parcelas: string };
  const linhaVazia = (): LinhaPag => ({
    forma: "dinheiro",
    valor: "0",
    bandeira: "",
    parcelas: "1",
  });
  const [cobrancaLinhas, setCobrancaLinhas] = useState<LinhaPag[]>([linhaVazia()]);

  // Formularios
  const [valorAbertura, setValorAbertura] = useState("0");
  const [obsAbertura, setObsAbertura] = useState("");
  const [movValor, setMovValor] = useState("");
  const [movDesc, setMovDesc] = useState("");
  const [movForma, setMovForma] = useState("dinheiro");
  const [movBandeira, setMovBandeira] = useState("");
  const [movParcelas, setMovParcelas] = useState("1");
  const [movDestinoUserId, setMovDestinoUserId] = useState("");
  const [membrosClinica, setMembrosClinica] = useState<Array<{ user_id: string; nome: string }>>([]);
  const [valorInformado, setValorInformado] = useState("");
  const [obsFechamento, setObsFechamento] = useState("");
  const [saving, setSaving] = useState(false);

  // Atalho: 1..5 na modal de cobrança seleciona a forma da última linha
  useEffect(() => {
    if (!openCobranca) return;
    const formas = ["dinheiro", "pix", "debito", "credito"] as const;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable))
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const forma = formas[Number(e.key) - 1];
        setCobrancaLinhas((prev) => {
          const next = [...prev];
          const i = next.length - 1;
          next[i] = { ...next[i], forma, bandeira: "", parcelas: "1" };
          return next;
        });
      } else if (e.key === "5") {
        e.preventDefault();
        setCobrancaLinhas((prev) => {
          if (!openCobranca) return [...prev, linhaVazia()];
          const next = [...prev];
          if (prev.length === 1) {
            const atual = Number(prev[0].valor) || 0;
            if (Math.abs(atual - openCobranca.valor) < 0.01) {
              next[0] = { ...prev[0], valor: String(openCobranca.valor_cartao || atual) };
            }
          }
          next.push(linhaVazia());
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCobranca]);

  const load = useCallback(async () => {
    if (!clinicaAtual || !user) return;
    setLoading(true);
    // Sessao aberta do usuario
    const [abertaRes, histRes] = await Promise.all([
      supabase
        .from("caixa_sessoes")
        .select(SESSAO_FIELDS)
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("user_id", user.id)
        .eq("status", "aberto")
        .order("aberto_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("caixa_sessoes")
        .select(SESSAO_FIELDS)
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("user_id", user.id)
        .order("aberto_em", { ascending: false })
        .limit(20),
    ]);
    const aberta = abertaRes.data;
    setMinhaSessao((aberta ?? null) as Sessao | null);

    if (aberta) {
      const { data: movs } = await supabase
        .from("caixa_movimentos")
        .select(MOV_FIELDS)
        .eq("sessao_id", (aberta as Sessao).id)
        .order("created_at", { ascending: true });
      const movsList = (movs ?? []) as Mov[];
      setMinhasMovs(movsList);
      // Enriquecer com nome do serviço e médico
      const lancIds = Array.from(new Set(movsList.map((m) => m.lancamento_id).filter((x): x is string => !!x)));
      const enrich = new Map<string, { servico: string | null; medico: string | null }>();
      if (lancIds.length > 0) {
        const { data: lancs } = await supabase
          .from("fin_lancamentos")
          .select("id, medico_id, agendamento_id, descricao")
          .in("id", lancIds);
        const lancRows = (lancs ?? []) as Array<{ id: string; medico_id: string | null; agendamento_id: string | null; descricao: string | null }>;
        const medIds = Array.from(new Set(lancRows.map((l) => l.medico_id).filter((x): x is string => !!x)));
        const agIds = Array.from(new Set(lancRows.map((l) => l.agendamento_id).filter((x): x is string => !!x)));
        const [medRes, agRes] = await Promise.all([
          medIds.length > 0
            ? supabase.from("medicos").select("id, nome").in("id", medIds)
            : Promise.resolve({ data: [] as Array<{ id: string; nome: string | null }> }),
          agIds.length > 0
            ? supabase.from("agendamentos").select("id, procedimento_id").in("id", agIds)
            : Promise.resolve({ data: [] as Array<{ id: string; procedimento_id: string | null }> }),
        ]);
        const medMap = new Map<string, string>();
        for (const m of (medRes.data ?? []) as Array<{ id: string; nome: string | null }>) {
          if (m.nome) medMap.set(m.id, m.nome);
        }
        const agMap = new Map<string, string | null>();
        const procIds = new Set<string>();
        for (const a of (agRes.data ?? []) as Array<{ id: string; procedimento_id: string | null }>) {
          agMap.set(a.id, a.procedimento_id);
          if (a.procedimento_id) procIds.add(a.procedimento_id);
        }
        const procMap = new Map<string, string>();
        if (procIds.size > 0) {
          const { data: procs } = await supabase
            .from("procedimentos")
            .select("id, nome")
            .in("id", Array.from(procIds));
          for (const p of (procs ?? []) as Array<{ id: string; nome: string | null }>) {
            if (p.nome) procMap.set(p.id, p.nome);
          }
        }
        for (const l of lancRows) {
          const procId = l.agendamento_id ? agMap.get(l.agendamento_id) ?? null : null;
          const servicoFromProc = procId ? procMap.get(procId) ?? null : null;
          // fallback: extrai serviço da descrição do lançamento após " — " ou " · "
          let servico = servicoFromProc;
          if (!servico && l.descricao) {
            const desc = l.descricao;
            const idx = Math.max(desc.lastIndexOf(" — "), desc.lastIndexOf(" · "));
            if (idx > 0) servico = desc.slice(idx + 3).replace(/\s*\(.*\)\s*$/, "").trim() || null;
          }
          enrich.set(l.id, {
            servico,
            medico: l.medico_id ? medMap.get(l.medico_id) ?? null : null,
          });
        }
      }
      setEnrichPorLanc(enrich);
    } else {
      setMinhasMovs([]);
      setEnrichPorLanc(new Map());
    }

    setMinhasSessoes((histRes.data ?? []) as Sessao[]);
    setLoading(false);
  }, [clinicaAtual, user]);

  // Recarrega o conjunto de solicitações de estorno pendentes vinculadas
  // às movimentações atuais para trocar o botão pelo rótulo
  // "Aguardando aprovação" quando o financeiro ainda não decidiu.
  const reloadEstornosPendentes = useCallback(async () => {
    if (!clinicaAtual) { setEstornosPorLanc(new Map()); return; }
    const ids = Array.from(new Set(
      minhasMovs.map((m) => m.lancamento_id).filter((x): x is string => !!x),
    ));
    if (ids.length === 0) { setEstornosPorLanc(new Map()); return; }
    const { data } = await supabase
      .from("estorno_solicitacoes")
      .select("lancamento_id, status")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .in("lancamento_id", ids)
      .in("status", ["pendente", "aprovado"]);
    const map = new Map<string, "pendente" | "aprovado">();
    for (const r of (data ?? []) as Array<{ lancamento_id: string | null; status: string }>) {
      if (!r.lancamento_id) continue;
      // pendente prevalece sobre aprovado caso ambos existam
      const prev = map.get(r.lancamento_id);
      if (prev === "pendente") continue;
      if (r.status === "pendente" || r.status === "aprovado") {
        map.set(r.lancamento_id, r.status);
      }
    }
    setEstornosPorLanc(map);
  }, [clinicaAtual, minhasMovs]);

  useEffect(() => {
    void reloadEstornosPendentes();
  }, [reloadEstornosPendentes]);

  // Realtime: se o financeiro aprovar/recusar ou outro caixa solicitar,
  // atualiza o rótulo do botão sem exigir F5.
  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel(`caixa-estornos-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "estorno_solicitacoes",
          filter: `clinica_id=eq.${clinicaAtual.clinica_id}`,
        },
        () => { void reloadEstornosPendentes(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clinicaAtual, reloadEstornosPendentes]);

  // Se o usuário voltar para a aba após o financeiro decidir e o evento
  // realtime tiver sido perdido, ressincroniza ao ganhar foco.
  useEffect(() => {
    const onFocus = () => { void reloadEstornosPendentes(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reloadEstornosPendentes]);

  // Carrega a fila de cobrança (agendamentos hoje aguardando caixa)
  const loadFilaCaixa = useCallback(async () => {
    if (!clinicaAtual) return;
    const hoje = new Date().toISOString().slice(0, 10);
    // P1-CAIXA-001 Etapa 4: uma única RPC substitui 7 queries em cascata.
    // A função `fila_caixa_hoje` calcula valores (particular/convênio/CB)
    // e `ja_pago` server-side. Ver migration 20260704171043.
    const { data, error } = await supabase.rpc("fila_caixa_hoje", {
      _clinica_id: clinicaAtual.clinica_id,
      _data: hoje,
    });
    if (error) {
      console.error("[caixa] fila_caixa_hoje error", error);
      setFilaCaixa([]);
      return;
    }
    const rows = (data ?? []) as Array<{
      id: string;
      paciente_id: string | null;
      paciente_nome: string;
      procedimento: string | null;
      inicio: string;
      medico_nome: string | null;
      valor: number | string | null;
      valor_cartao: number | string | null;
      ja_pago: boolean;
      desconto_origem: string | null;
    }>;
    setFilaCaixa(
      rows.map((r) => ({
        id: r.id,
        paciente_id: r.paciente_id,
        paciente_nome: r.paciente_nome,
        procedimento: r.desconto_origem
          ? `${r.procedimento} (${r.desconto_origem})`
          : r.procedimento,
        inicio: r.inicio,
        medico_nome: r.medico_nome,
        valor: Number(r.valor ?? 0),
        valor_cartao: Number(r.valor_cartao ?? 0),
        ja_pago: r.ja_pago,
      })),
    );
  }, [clinicaAtual]);

  useEffect(() => {
    if (minhaSessao) void loadFilaCaixa();
  }, [minhaSessao, loadFilaCaixa]);

  // Consome ?receber=<agendamentoId> vindo do CaixaShellV2:
  // abre a cobrança do paciente correto assim que a fila carregar.
  // Mantém a lógica de gravação/regra intacta — apenas atalho de UI.
  const receberHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!minhaSessao || filaCaixa.length === 0) return;
    const url = new URL(window.location.href);
    const rid = url.searchParams.get("receber");
    if (!rid || receberHandledRef.current === rid) return;
    receberHandledRef.current = rid;
    const item = filaCaixa.find((f) => f.id === rid);
    // limpa o parâmetro para não reabrir em refresh
    url.searchParams.delete("receber");
    window.history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
    if (!item) {
      toast.info("Paciente não está mais na fila do caixa.");
      return;
    }
    if (item.ja_pago) {
      toast.info(`${item.paciente_nome} já foi pago — cobrança bloqueada para evitar duplicidade.`);
      return;
    }
    setOpenCobranca(item);
    setCobrancaLinhas([
      { forma: "dinheiro", valor: String(item.valor || 0), bandeira: "", parcelas: "1" },
    ]);
  }, [minhaSessao, filaCaixa]);

  useEffect(() => {
    if (!clinicaAtual || !minhaSessao) return;
    const ch = supabase
      .channel(`caixa-fila-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `clinica_id=eq.${clinicaAtual.clinica_id}`,
        },
        () => {
          void loadFilaCaixa();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [clinicaAtual, minhaSessao, loadFilaCaixa]);

  // Executa cobrança: insere movimento caixa + lançamento financeiro + avança fluxo
  const cobrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user || !minhaSessao || !openCobranca) return;
    // Valida cada linha
    const linhasValidadas: Array<{
      forma: string;
      valor: number;
      bandeira: string;
      parcelas: string;
    }> = [];
    for (const l of cobrancaLinhas) {
      const v = Number(l.valor) || 0;
      if (v <= 0) {
        toast.error("Cada forma de pagamento precisa ter valor maior que zero");
        return;
      }
      if ((l.forma === "credito" || l.forma === "debito") && !l.bandeira) {
        toast.error("Selecione a bandeira do cartão em todas as linhas");
        return;
      }
      linhasValidadas.push({
        forma: l.forma,
        valor: v,
        bandeira: l.bandeira,
        parcelas: l.parcelas,
      });
    }
    if (linhasValidadas.length === 0) {
      toast.error("Adicione ao menos uma forma de pagamento");
      return;
    }
    setSaving(true);
    try {
      // Re-checa server-side se já foi pago (anti dupla cobrança / race)
      const { data: jaPago } = await supabase
        .from("fin_lancamentos")
        .select("id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .eq("agendamento_id", openCobranca.id)
        .limit(1)
        .maybeSingle();
      if (jaPago) {
        toast.error("Este agendamento já possui cobrança registrada.");
        setOpenCobranca(null);
        void loadFilaCaixa();
        return;
      }
      // Busca medico_id do agendamento para alimentar o repasse médico
      const { data: ag } = await supabase
        .from("agendamentos")
        .select("medico_id")
        .eq("id", openCobranca.id)
        .maybeSingle();
      const medicoId = (ag as { medico_id: string | null } | null)?.medico_id ?? null;
      const hoje = new Date().toISOString().slice(0, 10);
      for (const l of linhasValidadas) {
        const sufixoCartao = montarSufixoCartao(l.forma, l.bandeira, l.parcelas);
        const { error: e1 } = await supabase.from("caixa_movimentos").insert({
          sessao_id: minhaSessao.id,
          clinica_id: clinicaAtual.clinica_id,
          user_id: user.id,
          tipo: "recebimento",
          valor: l.valor,
          descricao: `${openCobranca.paciente_nome} · ${openCobranca.procedimento ?? "atendimento"}${sufixoCartao}`,
          forma_pagamento: l.forma,
        });
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("fin_lancamentos").insert({
          clinica_id: clinicaAtual.clinica_id,
          tipo: "receita",
          descricao: `Recebimento — ${openCobranca.paciente_nome} (${openCobranca.procedimento ?? "atendimento"})${sufixoCartao}`,
          valor: l.valor,
          data: hoje,
          status: "confirmado",
          forma_pagamento: l.forma,
          paciente_id: openCobranca.paciente_id,
          agendamento_id: openCobranca.id,
          medico_id: medicoId,
          criado_por: user.id,
        } as never);
        if (e2) throw e2;
      }
      const { error: e3 } = await supabase
        .from("agendamentos")
        .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
        .eq("id", openCobranca.id);
      if (e3) throw e3;
      toast.success("Cobrança registrada · paciente enviado à triagem");
      setOpenCobranca(null);
      setCobrancaLinhas([linhaVazia()]);
      void load();
      void loadFilaCaixa();
    } catch (err) {
      mostrarErro(err);
    } finally {
      setSaving(false);
    }
  };

  const loadTodos = useCallback(async () => {
    if (!clinicaAtual || !isManager) return;
    const ini = new Date(fIni + "T00:00:00").toISOString();
    const fim = new Date(fFim + "T23:59:59").toISOString();
    let q = supabase
      .from("caixa_sessoes")
      .select(SESSAO_FIELDS)
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("aberto_em", ini)
      .lte("aberto_em", fim)
      .order("aberto_em", { ascending: false });
    if (fUserId) q = q.eq("user_id", fUserId);
    const { data } = await q;
    const sess = (data ?? []) as Sessao[];
    setTodasSessoes(sess);

    if (sess.length > 0) {
      const ids = sess.map((s) => s.id);
      const { data: movs } = await supabase
        .from("caixa_movimentos")
        .select(MOV_FIELDS)
        .in("sessao_id", ids);
      setTodosMovs((movs ?? []) as Mov[]);
    } else {
      setTodosMovs([]);
    }

    // Lista de operadores que abriram caixa
    const nomes = new Map<string, string>();
    sess.forEach((s) => {
      if (s.user_id) nomes.set(s.user_id, s.user_nome || s.user_id.slice(0, 8));
    });
    setUsersList(Array.from(nomes.entries()).map(([user_id, nome]) => ({ user_id, nome })));
  }, [clinicaAtual, isManager, fIni, fFim, fUserId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab === "todos") void loadTodos();
  }, [tab, loadTodos]);

  // Membros da clínica para o seletor de destino de sangria/suprimento
  useEffect(() => {
    if (!clinicaAtual) { setMembrosClinica([]); return; }
    let alive = true;
    void (async () => {
      const { data: memb } = await supabase
        .from("clinica_memberships")
        .select("user_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true);
      const ids = ((memb ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
      if (!ids.length) { if (alive) setMembrosClinica([]); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      const list = ((profs ?? []) as Array<{ id: string; nome: string | null }>)
        .map((p) => ({ user_id: p.id, nome: p.nome || "(sem nome)" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      if (alive) setMembrosClinica(list);
    })();
    return () => { alive = false; };
  }, [clinicaAtual?.clinica_id]);

  // Calculos
  const saldoAtual = useMemo(() => {
    if (!minhaSessao) return 0;
    return minhasMovs.reduce((acc, m) => acc + TIPO_SINAL[m.tipo] * Number(m.valor || 0), 0);
  }, [minhaSessao, minhasMovs]);

  const resumoTipos = useMemo(() => {
    const r: Record<MovTipo, number> = {
      abertura: 0,
      sangria: 0,
      suprimento: 0,
      recebimento: 0,
      despesa: 0,
      fechamento: 0,
    };
    minhasMovs.forEach((m) => {
      r[m.tipo] += Number(m.valor || 0);
    });
    return r;
  }, [minhasMovs]);

  // Decomposição de pagamentos "misto" — busca observações dos lançamentos
  // vinculados às movimentações da sessão atual. Chave = lancamento_id.
  const [mistoObs, setMistoObs] = useState<Record<string, string>>({});
  const mistoLancIds = useMemo(() => {
    const ids = new Set<string>();
    const scan = (arr: Mov[]) => arr.forEach((m) => {
      if (m.tipo === "recebimento" && normalizarForma(m.forma_pagamento) === "misto" && m.lancamento_id) {
        ids.add(m.lancamento_id);
      }
    });
    scan(minhasMovs);
    scan(detalheMovs);
    return Array.from(ids);
  }, [minhasMovs, detalheMovs]);
  useEffect(() => {
    let alive = true;
    const pendentes = mistoLancIds.filter((id) => !(id in mistoObs));
    if (pendentes.length === 0) return;
    (async () => {
      const { data } = await supabase.from("fin_lancamentos")
        .select("id, observacoes").in("id", pendentes);
      if (!alive || !data) return;
      setMistoObs((prev) => {
        const next = { ...prev };
        for (const row of data) next[row.id as string] = (row.observacoes as string | null) ?? "";
        // Marca também os que não voltaram, para não refazer o fetch em loop.
        for (const id of pendentes) if (!(id in next)) next[id] = "";
        return next;
      });
    })();
    return () => { alive = false; };
  }, [mistoLancIds, mistoObs]);

  // Entradas agrupadas por forma de pagamento (recebimento + suprimento).
  // Aliases cartao_credito/cartao_debito ficam em credito/debito; pagamentos
  // "misto" são decompostos pelas observações do fin_lancamento.
  const entradasPorForma = useMemo(() => {
    const r: Record<string, number> & { total: number } = {
      dinheiro: 0, pix: 0, debito: 0, credito: 0,
      boleto: 0, transferencia: 0, convenio: 0, outros: 0, total: 0,
    };
    minhasMovs.forEach((m) => {
      if (m.tipo !== "recebimento" && m.tipo !== "suprimento") return;
      const v = Number(m.valor || 0);
      r.total += v;
      const bucket = normalizarForma(m.forma_pagamento);
      if (bucket === "misto") {
        const obs = m.lancamento_id ? mistoObs[m.lancamento_id] : undefined;
        const partes = decomporMistoObs(obs);
        let somado = 0;
        for (const [k, val] of Object.entries(partes)) {
          r[k] = (r[k] ?? 0) + (val ?? 0);
          somado += val ?? 0;
        }
        // Diferença (ex.: obs ainda não carregada, ou parcela sem label
        // reconhecido) vai para "outros" para preservar o total.
        const resto = v - somado;
        if (Math.abs(resto) > 0.005) r.outros += resto;
      } else {
        r[bucket] += v;
      }
    });
    return r;
  }, [minhasMovs, mistoObs]);

  // Calculo por sessao (todos)
  const calcSaldoSessao = useCallback(
    (sid: string) => {
      return todosMovs
        .filter((m) => m.sessao_id === sid)
        .reduce((acc, m) => acc + TIPO_SINAL[m.tipo] * Number(m.valor || 0), 0);
    },
    [todosMovs],
  );

  // Totais auxiliares por sessao
  const calcSangriaSessao = useCallback(
    (sid: string) => {
      return todosMovs
        .filter((m) => m.sessao_id === sid && m.tipo === "sangria")
        .reduce((acc, m) => acc + Number(m.valor || 0), 0);
    },
    [todosMovs],
  );
  const calcEstornoSessao = useCallback(
    (sid: string) => {
      return todosMovs
        .filter((m) => m.sessao_id === sid && (m.descricao ?? "").toLowerCase().includes("estorno"))
        .reduce((acc, m) => acc + Number(m.valor || 0), 0);
    },
    [todosMovs],
  );

  // Acoes
  const abrirCaixa = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user) return;
    setSaving(true);
    const v = Number(valorAbertura) || 0;
    const nome = user.user_metadata?.nome || user.email || null;
    // Trava: já existe sessão aberta para este usuário nesta clínica?
    const { data: existente } = await supabase
      .from("caixa_sessoes")
      .select("id")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("user_id", user.id)
      .eq("status", "aberto")
      .limit(1)
      .maybeSingle();
    if (existente) {
      setSaving(false);
      toast.error("Você já possui um caixa aberto.");
      setOpenAbrir(false);
      void load();
      return;
    }
    const { data: sess, error } = await supabase
      .from("caixa_sessoes")
      .insert({
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        user_nome: nome,
        valor_abertura: v,
        observacoes: obsAbertura || null,
      })
      .select(SESSAO_FIELDS)
      .single();
    if (error || !sess) {
      setSaving(false);
      mostrarErro(error);
      return;
    }
    // movimento abertura
    await supabase.from("caixa_movimentos").insert({
      sessao_id: (sess as Sessao).id,
      clinica_id: clinicaAtual.clinica_id,
      user_id: user.id,
      tipo: "abertura",
      valor: v,
      descricao: obsAbertura || "Abertura de caixa",
    });
    setSaving(false);
    setOpenAbrir(false);
    setValorAbertura("0");
    setObsAbertura("");
    toast.success("Caixa aberto");
    void load();
  };

  const lancarMov = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user || !minhaSessao || !openMov) return;
    const v = Number(movValor) || 0;
    if (v <= 0) {
      toast.error("Informe um valor");
      return;
    }
    const ehPagto = openMov.tipo === "recebimento" || openMov.tipo === "despesa";
    if (ehPagto && (movForma === "credito" || movForma === "debito") && !movBandeira) {
      toast.error("Selecione a bandeira do cartão");
      return;
    }
    const ehTransfer = openMov.tipo === "sangria" || openMov.tipo === "suprimento";
    if (ehTransfer && !movDestinoUserId) {
      toast.error(openMov.tipo === "sangria"
        ? "Selecione a quem o dinheiro está sendo entregue"
        : "Selecione de quem o dinheiro está sendo recebido");
      return;
    }
    const destinoNome = ehTransfer
      ? (membrosClinica.find((m) => m.user_id === movDestinoUserId)?.nome ?? null)
      : null;
    const sufixoDestino = ehTransfer && destinoNome
      ? ` — ${openMov.tipo === "sangria" ? "Entregue a" : "Recebido de"}: ${destinoNome}`
      : "";
    const sufixoCartao = ehPagto ? montarSufixoCartao(movForma, movBandeira, movParcelas) : "";
    setSaving(true);
    const { error } = await supabase.from("caixa_movimentos").insert({
      sessao_id: minhaSessao.id,
      clinica_id: clinicaAtual.clinica_id,
      user_id: user.id,
      tipo: openMov.tipo,
      valor: v,
      descricao: ((movDesc || "") + sufixoCartao + sufixoDestino) || null,
      forma_pagamento: ehPagto ? movForma : null,
      destino_user_id: ehTransfer ? movDestinoUserId : null,
      destino_nome: ehTransfer ? destinoNome : null,
    });
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setOpenMov(null);
<<<<<<< HEAD
    setMovValor("");
    setMovDesc("");
    setMovForma("dinheiro");
    setMovBandeira("");
    setMovParcelas("1");
    toast.success(`${TIPO_LABEL[openMov.tipo]} registrada`);
=======
    const tipoLancado = openMov.tipo;
    const descLancada = (movDesc || "") + sufixoCartao + sufixoDestino;
    setMovValor(""); setMovDesc(""); setMovForma("dinheiro");
    setMovBandeira(""); setMovParcelas("1"); setMovDestinoUserId("");
    toast.success(`${TIPO_LABEL[tipoLancado]} registrada`);
    if (tipoLancado === "sangria" || tipoLancado === "suprimento") {
      printComprovanteCaixa({
        tipo: tipoLancado,
        clinicaNome: clinicaAtual.clinica?.nome ?? "Clínica",
        operadorNome: minhaSessao.user_nome || user.user_metadata?.nome || user.email || "Atendente",
        valor: v,
        descricao: descLancada || null,
        destinoNome,
      });
    }
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
    void load();
  };

  const fecharCaixa = async (e: FormEvent) => {
    e.preventDefault();
    if (!minhaSessao || !clinicaAtual || !user) return;
    const informado = Number(valorInformado) || 0;
    const diff = informado - saldoAtual;
    setSaving(true);
    const { error } = await supabase
      .from("caixa_sessoes")
      .update({
        status: "fechado",
        fechado_em: new Date().toISOString(),
        valor_fechamento_informado: informado,
        valor_fechamento_calculado: saldoAtual,
        diferenca: diff,
        observacoes: obsFechamento
          ? `${minhaSessao.observacoes ? minhaSessao.observacoes + " | " : ""}${obsFechamento}`
          : minhaSessao.observacoes,
      })
      .eq("id", minhaSessao.id);
    if (!error) {
      await supabase.from("caixa_movimentos").insert({
        sessao_id: minhaSessao.id,
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        tipo: "fechamento",
        valor: informado,
        descricao: `Fechamento. Calculado: ${fmt(saldoAtual)} | Informado: ${fmt(informado)} | Diferença: ${fmt(diff)}`,
      });
    }
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setOpenFechar(false);
<<<<<<< HEAD
    setValorInformado("");
    setObsFechamento("");
=======
    const obsFinal = obsFechamento;
    setValorInformado(""); setObsFechamento("");
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
    toast.success("Caixa fechado");
    // Total recebido por forma de pagamento na sessão — normaliza aliases e
    // decompõe "misto" consultando observacoes do lançamento.
    const porForma: Record<string, number> = {};
    const mistoIds: string[] = [];
    const mistoValoresTotais: Record<string, number> = {};
    minhasMovs.forEach((m) => {
      if (m.tipo !== "recebimento") return;
      const v = Number(m.valor || 0);
      const bucket = normalizarForma(m.forma_pagamento);
      if (bucket === "misto" && m.lancamento_id) {
        mistoIds.push(m.lancamento_id);
        mistoValoresTotais[m.lancamento_id] = (mistoValoresTotais[m.lancamento_id] ?? 0) + v;
      } else {
        porForma[bucket] = (porForma[bucket] ?? 0) + v;
      }
    });
    if (mistoIds.length > 0) {
      const { data: lancs } = await supabase
        .from("fin_lancamentos")
        .select("id, observacoes")
        .in("id", mistoIds);
      (lancs ?? []).forEach((l: { id: string; observacoes: string | null }) => {
        const partes = decomporMistoObs(l.observacoes);
        let somado = 0;
        for (const [k, val] of Object.entries(partes)) {
          porForma[k] = (porForma[k] ?? 0) + (val ?? 0);
          somado += val ?? 0;
        }
        const total = mistoValoresTotais[l.id] ?? 0;
        const resto = total - somado;
        if (Math.abs(resto) > 0.005) porForma.outros = (porForma.outros ?? 0) + resto;
      });
    }
    // Remove buckets zerados para não poluir o comprovante.
    for (const k of Object.keys(porForma)) if (Math.abs(porForma[k]) < 0.005) delete porForma[k];
    printComprovanteCaixa({
      tipo: "fechamento",
      clinicaNome: clinicaAtual.clinica?.nome ?? "Clínica",
      operadorNome: minhaSessao.user_nome || user.user_metadata?.nome || user.email || "Atendente",
      valor: informado,
      saldoCalculado: saldoAtual,
      valorInformado: informado,
      diferenca: diff,
      descricao: obsFinal || null,
      porForma,
    });
    void load();
  };

  const verDetalhe = async (s: Sessao) => {
    setOpenDetalhe(s);
    const { data } = await supabase
      .from("caixa_movimentos")
      .select(MOV_FIELDS)
      .eq("sessao_id", s.id)
      .order("created_at", { ascending: true });
    setDetalheMovs((data ?? []) as Mov[]);
  };

  const exportarTodos = () => {
    const rows = todasSessoes.map((s) => ({
      Operador: s.user_nome || s.user_id.slice(0, 8),
      Abertura: fmtDT(s.aberto_em),
      Fechamento: fmtDT(s.fechado_em),
      Status: s.status,
      "Valor abertura": Number(s.valor_abertura || 0),
      "Saldo calculado": calcSaldoSessao(s.id),
      "Valor informado": Number(s.valor_fechamento_informado || 0),
      Sangria: calcSangriaSessao(s.id),
      Estorno: calcEstornoSessao(s.id),
      Diferenca: Number(s.diferenca || 0),
    }));
    exportToExcel(rows, `caixas_${fIni}_a_${fFim}`);
  };

  const exportarDetalhe = () => {
    if (!openDetalhe) return;
    const rows = detalheMovs.map((m) => ({
      Data: new Date(m.created_at).toLocaleDateString("pt-BR"),
      Hora: new Date(m.created_at).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      Tipo: TIPO_LABEL[m.tipo],
      Descricao: m.descricao ?? "",
      Forma: m.forma_pagamento ?? "",
      Valor: (TIPO_SINAL[m.tipo] < 0 ? -1 : 1) * Number(m.valor || 0),
    }));
    const op = (openDetalhe.user_nome || "operador").replace(/\s+/g, "_");
    exportToExcel(rows, `sessao_caixa_${op}_${openDetalhe.id.slice(0, 8)}`);
  };

  const imprimirDetalhe = () => {
    if (!openDetalhe) return;
    const s = openDetalhe;
    const esc = (v: unknown) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    const linhas = detalheMovs
      .map(
        (m) => `
      <tr>
        <td>${new Date(m.created_at).toLocaleDateString("pt-BR")}</td>
        <td>${new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
        <td>${TIPO_LABEL[m.tipo]}</td>
        <td>${esc(m.descricao ?? "")}</td>
        <td>${esc(m.forma_pagamento ?? "—")}</td>
        <td style="text-align:right;">${TIPO_SINAL[m.tipo] < 0 ? "-" : ""}${fmt(m.valor)}</td>
      </tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Sessão de caixa</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;}
        h1{font-size:18px;margin:0 0 4px;}
        .meta{font-size:12px;color:#475569;margin-bottom:12px;}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;margin-bottom:12px;}
        .grid div{border:1px solid #e2e8f0;border-radius:6px;padding:8px;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th,td{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left;}
        th{background:#f1f5f9;}
      </style></head><body>
      <h1>Sessão de caixa</h1>
      <div class="meta">${esc(s.user_nome ?? "—")} · ${fmtDT(s.aberto_em)} → ${fmtDT(s.fechado_em)}</div>
      <div class="grid">
        <div><b>Abertura</b><br/>${fmt(s.valor_abertura)}</div>
        <div><b>Calculado</b><br/>${fmt(s.valor_fechamento_calculado)}</div>
        <div><b>Informado</b><br/>${fmt(s.valor_fechamento_informado)}</div>
        <div><b>Diferença</b><br/>${fmt(s.diferenca)}</div>
      </div>
      <table><thead><tr>
        <th>Data</th><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th style="text-align:right;">Valor</th>
      </tr></thead><tbody>${linhas}</tbody></table>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Bloqueador de pop-up impediu a impressão");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Caixa
          </h1>
          <p className="text-sm text-muted-foreground">
            Abertura, sangria, suprimento, recebimentos e fechamento.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "meu" | "todos" | "repasse")}>
        <TabsList>
          <TabsTrigger value="meu">Meu caixa</TabsTrigger>
          {isManager && (
            <TabsTrigger value="todos">
              <Users className="h-4 w-4 mr-1" /> Todos (Financeiro)
            </TabsTrigger>
          )}
          <TabsTrigger value="repasse">
            <HandCoins className="h-4 w-4 mr-1" /> Repasse médico
          </TabsTrigger>
        </TabsList>

        {/* ===================== MEU CAIXA ===================== */}
        <TabsContent value="meu" className="space-y-4 pt-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {!loading && (
            <Tabs defaultValue="saldo" className="w-full">
              <TabsList>
                <TabsTrigger value="saldo">Saldo</TabsTrigger>
                <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
                <TabsTrigger value="aguardando">Aguardando</TabsTrigger>
              </TabsList>

              {/* ---------- Saldo ---------- */}
              <TabsContent value="saldo" className="space-y-4 pt-4">
                {!minhaSessao ? (
                  <Card>
                    <CardContent className="py-10 text-center space-y-3">
                      <Wallet className="h-10 w-10 mx-auto text-muted-foreground" />
                      <p className="text-muted-foreground">Nenhum caixa aberto.</p>
                      <Button onClick={() => setOpenAbrir(true)}>
                        <Unlock className="h-4 w-4 mr-2" /> Abrir caixa
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCaixaDrill("saldo")}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Saldo atual</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold text-primary">
                    {fmt(saldoAtual)}
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCaixaDrill("abertura")}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Abertura</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg">{fmt(minhaSessao.valor_abertura)}</CardContent>
                </Card>
                <Card
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCaixaDrill("entradas")}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Entradas</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg text-emerald-600">
                    {fmt(resumoTipos.suprimento + resumoTipos.recebimento)}
                  </CardContent>
                </Card>
                <Card
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setCaixaDrill("saidas")}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Saídas</CardTitle>
                  </CardHeader>
                  <CardContent className="text-lg text-rose-600">
                    {fmt(resumoTipos.sangria + resumoTipos.despesa)}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">Entradas por forma de pagamento</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const cards: Array<{ label: string; value: number; sempre?: boolean }> = [
                      { label: "Dinheiro", value: entradasPorForma.dinheiro, sempre: true },
                      { label: "PIX", value: entradasPorForma.pix, sempre: true },
                      { label: "Débito", value: entradasPorForma.debito, sempre: true },
                      { label: "Crédito", value: entradasPorForma.credito, sempre: true },
                      { label: "Boleto", value: entradasPorForma.boleto },
                      { label: "Transferência", value: entradasPorForma.transferencia },
                      { label: "Convênio", value: entradasPorForma.convenio },
                      { label: "Outros", value: entradasPorForma.outros },
                    ];
                    const visiveis = cards.filter((c) => c.sempre || (c.value ?? 0) > 0.005);
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {visiveis.map((it) => (
                          <div key={it.label} className="rounded-md border bg-muted/30 px-3 py-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{it.label}</div>
                            <div className="text-base font-semibold tabular-nums">{fmt(it.value)}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "suprimento" })}>
                  <ArrowDownToLine className="h-4 w-4 mr-2 text-emerald-600" /> Suprimento
                </Button>
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "sangria" })}>
                  <ArrowUpFromLine className="h-4 w-4 mr-2 text-rose-600" /> Sangria
                </Button>
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "recebimento" })}>
                  <PlusCircle className="h-4 w-4 mr-2 text-emerald-600" /> Recebimento
                </Button>
                <Button variant="outline" onClick={() => setOpenMov({ tipo: "despesa" })}>
                  <MinusCircle className="h-4 w-4 mr-2 text-rose-600" /> Despesa
                </Button>
                <div className="flex-1" />
                <Button
                  variant="destructive"
                  onClick={() => {
                    setValorInformado(saldoAtual.toFixed(2));
                    setOpenFechar(true);
                  }}
                >
                  <Lock className="h-4 w-4 mr-2" /> Fechar caixa
                </Button>
              </div>
                  </>
                )}
              </TabsContent>

              {/* ---------- Aguardando ---------- */}
              <TabsContent value="aguardando" className="space-y-4 pt-4">
                {!minhaSessao ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      Abra um caixa para visualizar a fila de cobrança.
                    </CardContent>
                  </Card>
                ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />
                    Cobrança de pacientes ({filaCaixa.filter((f) => !f.ja_pago).length} aguardando)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {filaCaixa.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum paciente aguardando cobrança hoje.
                    </p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[32rem] overflow-auto pr-1">
                      {filaCaixa.map((f) => {
                        const hora = new Date(f.inicio).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        return (
                          <div
                            key={f.id}
                            className={`rounded-md border p-2.5 text-sm space-y-1 ${f.ja_pago ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {hora}
                              </span>
                              {f.ja_pago ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  PAGO
                                </Badge>
                              ) : (
                                <span className="font-semibold text-primary">{fmt(f.valor)}</span>
                              )}
                            </div>
                            <div className="font-medium uppercase leading-tight line-clamp-1">
                              {f.paciente_nome}
                            </div>
                            <div className="text-[11px] text-muted-foreground line-clamp-1">
                              {f.procedimento ?? "—"}
                              {f.medico_nome ? ` · ${f.medico_nome}` : ""}
                            </div>
                            {!f.ja_pago && (
                              <Button
                                size="sm"
                                className="w-full h-7 text-xs"
                                onClick={() => {
                                  setOpenCobranca(f);
                                  setCobrancaLinhas([
                                    {
                                      forma: "dinheiro",
                                      valor: String(f.valor || 0),
                                      bandeira: "",
                                      parcelas: "1",
                                    },
                                  ]);
                                }}
                              >
                                <Receipt className="h-3 w-3 mr-1" /> Cobrar{" "}
                                <ChevronRight className="h-3 w-3 ml-auto" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
                )}
              </TabsContent>

              {/* ---------- Movimentos ---------- */}
              <TabsContent value="movimentos" className="space-y-4 pt-4">
                {!minhaSessao ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      Abra um caixa para visualizar os movimentos.
                    </CardContent>
                  </Card>
                ) : (
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">
                      {isManager ? "Movimentos da sessão" : "Movimentos de hoje"}
                      {filtrosAtivos && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({minhasMovsFiltrados.length} de {minhasMovs.length})
                        </span>
                      )}
                    </CardTitle>
                    {!isManager && (
                      <span className="text-xs text-muted-foreground">
                        {new Date().toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-2 flex-wrap">
                    {isManager && (
                      <div>
                        <Label className="text-xs">Período</Label>
<<<<<<< HEAD
                        <Select
                          value={meuPeriodo}
                          onValueChange={(v) => setMeuPeriodo(v as typeof meuPeriodo)}
                        >
                          <SelectTrigger className="h-8 w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hoje">Hoje</SelectItem>
                            <SelectItem value="semana">Última semana</SelectItem>
                            <SelectItem value="quinzena">Última quinzena</SelectItem>
                            <SelectItem value="mes">Último mês</SelectItem>
                            <SelectItem value="intervalo">Intervalo personalizado</SelectItem>
                            <SelectItem value="todos">Todos</SelectItem>
                          </SelectContent>
                        </Select>
=======
                        <Popover open={openCal} onOpenChange={setOpenCal}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 justify-start font-normal min-w-[220px]">
                              <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                              {periodoLabel}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <div className="flex flex-col sm:flex-row">
                              <div className="flex sm:flex-col gap-1 p-2 border-b sm:border-b-0 sm:border-r bg-muted/30">
                                {([
                                  ["hoje", "Hoje"],
                                  ["semana", "Última semana"],
                                  ["quinzena", "Última quinzena"],
                                  ["mes", "Último mês"],
                                  ["todos", "Todos"],
                                ] as const).map(([v, lbl]) => (
                                  <Button
                                    key={v}
                                    type="button"
                                    variant={meuPeriodo === v ? "default" : "ghost"}
                                    size="sm"
                                    className="justify-start text-xs h-7"
                                    onClick={() => { setMeuPeriodo(v); setOpenCal(false); }}
                                  >
                                    {lbl}
                                  </Button>
                                ))}
                              </div>
                              <Calendar
                                mode="range"
                                locale={ptBR}
                                numberOfMonths={2}
                                selected={{
                                  from: meuDataIni ? new Date(meuDataIni + "T00:00:00") : undefined,
                                  to: meuDataFim ? new Date(meuDataFim + "T00:00:00") : undefined,
                                }}
                                onSelect={(range: DateRange | undefined) => {
                                  if (!range?.from) return;
                                  const f = range.from;
                                  const t = range.to ?? range.from;
                                  const iso = (d: Date) =>
                                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                                  setMeuDataIni(iso(f));
                                  setMeuDataFim(iso(t));
                                  setMeuPeriodo("intervalo");
                                  if (range.to) setOpenCal(false);
                                }}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Médico</Label>
                      <Select value={meuMedico} onValueChange={setMeuMedico}>
                        <SelectTrigger className="h-8 w-[200px]">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Todos os médicos</SelectItem>
                          {medicosDisponiveis.map((n) => (
                            <SelectItem key={n} value={n}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Paciente</Label>
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={meuPaciente}
                          onChange={(e) => setMeuPaciente(e.target.value)}
                          placeholder="Buscar paciente..."
                          className="h-8 w-[200px] pl-7"
                        />
                      </div>
                    </div>
                    {filtrosAtivos && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={limparFiltros}
                        className="h-8 text-xs"
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Limpar
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Médico</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right w-[1%]">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {minhasMovsFiltrados.length === 0 ? (
                        <TableRow>
<<<<<<< HEAD
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            {isManager ? "Sem movimentos no período" : "Sem movimentos hoje"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        minhasMovsFiltrados.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap">
                              {new Date(m.created_at).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={TIPO_CLASS[m.tipo]}>
                                {TIPO_LABEL[m.tipo]}
                              </Badge>
                            </TableCell>
                            <TableCell>{m.descricao || "—"}</TableCell>
                            <TableCell>{m.forma_pagamento || "—"}</TableCell>
                            <TableCell
                              className={`text-right font-medium ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}
                            >
                              {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                              {fmt(m.valor)}
                            </TableCell>
                            <TableCell className="text-right">
                              {m.tipo === "recebimento" && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                  title="Solicitar estorno ao financeiro"
                                  onClick={() => setEstornoFor(m)}
                                >
                                  <Undo2 className="h-3 w-3 mr-1" /> Solicitar estorno
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
=======
                          <TableCell colSpan={9} className="text-center text-muted-foreground">
                            {filtrosAtivos
                              ? "Nenhum movimento corresponde aos filtros"
                              : isManager
                                ? "Sem movimentos no período"
                                : "Sem movimentos hoje"}
                          </TableCell>
                        </TableRow>
                      ) : minhasMovsFiltrados.map((m) => {
                        const enr = m.lancamento_id ? enrichPorLanc.get(m.lancamento_id) : undefined;
                        const servico = enr?.servico ?? servicoFromDescricao(m.descricao);
                        const medico = enr?.medico ?? null;
                        return (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap">{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                          <TableCell className="whitespace-nowrap">{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                          <TableCell><Badge variant="outline" className={TIPO_CLASS[m.tipo]}>{TIPO_LABEL[m.tipo]}</Badge></TableCell>
                          <TableCell>{m.descricao || "—"}</TableCell>
                          <TableCell className="text-xs">{servico || "—"}</TableCell>
                          <TableCell className="text-xs">{medico || "—"}</TableCell>
                          <TableCell className="text-xs">{formatarFormaPagamento(m, mistoObs)}</TableCell>
                          <TableCell className={`text-right font-medium ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}>
                            {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}{fmt(m.valor)}
                          </TableCell>
                          <TableCell className="text-right">
                            {m.tipo === "recebimento" && podeEscrever && (
                              (() => {
                                const st = m.lancamento_id ? estornosPorLanc.get(m.lancamento_id) : undefined;
                                if (st === "pendente") {
                                  return (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled
                                      className="h-7 text-xs text-amber-800 border-amber-300 bg-amber-50 cursor-not-allowed"
                                      title="Solicitação de estorno enviada — aguardando decisão do financeiro"
                                    >
                                      <Undo2 className="h-3 w-3 mr-1" /> Aguardando aprovação
                                    </Button>
                                  );
                                }
                                if (st === "aprovado") {
                                  return (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled
                                      className="h-7 text-xs text-slate-600 border-slate-300 bg-slate-100 cursor-not-allowed"
                                      title="Este lançamento já foi estornado"
                                    >
                                      <Undo2 className="h-3 w-3 mr-1" /> Estornado
                                    </Button>
                                  );
                                }
                                return (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                title="Solicitar estorno ao financeiro"
                                onClick={() => setEstornoFor(m)}
                              >
                                <Undo2 className="h-3 w-3 mr-1" /> Solicitar estorno
                              </Button>
                                );
                              })()
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      })}
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
                )}
              </TabsContent>

              {/* ---------- Histórico ---------- */}
              <TabsContent value="historico" className="space-y-4 pt-4">
                {minhasSessoes.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      Nenhuma sessão anterior.
                    </CardContent>
                  </Card>
                ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Meu histórico</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Abertura</TableHead>
                      <TableHead>Fechamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Abertura</TableHead>
                      <TableHead className="text-right">Informado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {minhasSessoes.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{fmtDT(s.aberto_em)}</TableCell>
                        <TableCell>{fmtDT(s.fechado_em)}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === "aberto" ? "default" : "secondary"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmt(s.valor_abertura)}</TableCell>
                        <TableCell className="text-right">
                          {fmt(s.valor_fechamento_informado)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${Number(s.diferenca || 0) < 0 ? "text-rose-600" : Number(s.diferenca || 0) > 0 ? "text-amber-600" : ""}`}
                        >
                          {fmt(s.diferenca)}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => verDetalhe(s)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
                )}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        {/* ===================== TODOS (FINANCEIRO) ===================== */}
        {isManager && (
          <TabsContent value="todos" className="space-y-4 pt-4">
            <Card>
              <CardContent className="pt-4 flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={fIni} onChange={(e) => setFIni(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} />
                </div>
                <div className="min-w-[200px]">
                  <Label className="text-xs">Operador</Label>
                  <Select
                    value={fUserId || "all"}
                    onValueChange={(v) => setFUserId(v === "all" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {usersList.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id} className="uppercase">
                          {u.nome?.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => void loadTodos()}>Filtrar</Button>
                <Button variant="outline" onClick={exportarTodos}>
                  <FileDown className="h-4 w-4 mr-2" /> Excel
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operador</TableHead>
                      <TableHead>Abertura</TableHead>
                      <TableHead>Fechamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Abertura</TableHead>
                      <TableHead className="text-right">Calculado</TableHead>
                      <TableHead className="text-right">Informado</TableHead>
                      <TableHead className="text-right">Sangria</TableHead>
                      <TableHead className="text-right">Estorno</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todasSessoes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground">
                          Sem sessões no período
                        </TableCell>
                      </TableRow>
                    )}
                    {todasSessoes.map((s) => {
                      const calc = calcSaldoSessao(s.id);
                      const sangria = calcSangriaSessao(s.id);
                      const estorno = calcEstornoSessao(s.id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium uppercase">
                            {(s.user_nome || s.user_id.slice(0, 8)).toUpperCase()}
                          </TableCell>
                          <TableCell>{fmtDT(s.aberto_em)}</TableCell>
                          <TableCell>{fmtDT(s.fechado_em)}</TableCell>
                          <TableCell>
                            <Badge variant={s.status === "aberto" ? "default" : "secondary"}>
                              {s.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{fmt(s.valor_abertura)}</TableCell>
                          <TableCell className="text-right">{fmt(calc)}</TableCell>
                          <TableCell className="text-right">
                            {fmt(s.valor_fechamento_informado)}
                          </TableCell>
                          <TableCell
                            className={`text-right ${sangria > 0 ? "text-amber-700" : "text-muted-foreground"}`}
                          >
                            {fmt(sangria)}
                          </TableCell>
                          <TableCell
                            className={`text-right ${estorno > 0 ? "text-rose-700" : "text-muted-foreground"}`}
                          >
                            {fmt(estorno)}
                          </TableCell>
                          <TableCell
                            className={`text-right ${Number(s.diferenca || 0) < 0 ? "text-rose-600" : Number(s.diferenca || 0) > 0 ? "text-amber-600" : ""}`}
                          >
                            {fmt(s.diferenca)}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => verDetalhe(s)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ===================== REPASSE MÉDICO ===================== */}
        <TabsContent value="repasse" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HandCoins className="h-5 w-5 text-emerald-600" />
                Repasse médico — resumo de hoje
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-rose-50 dark:bg-rose-950/30 p-4">
                  <p className="text-xs text-muted-foreground">A repassar hoje</p>
                  <p className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                    {fmt(repHoje.pendente)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {repHoje.qtd_pend} atendimento{repHoje.qtd_pend === 1 ? "" : "s"} ·{" "}
                    {repHoje.medicos} médico{repHoje.medicos === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4">
                  <p className="text-xs text-muted-foreground">Já repassado hoje</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {fmt(repHoje.pago)}
                  </p>
                </div>
                <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/30 p-4">
                  <p className="text-xs text-muted-foreground">Total movimentado</p>
                  <p className="text-2xl font-bold text-sky-700 dark:text-sky-400">
                    {fmt(repHoje.pendente + repHoje.pago)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h4 className="font-medium">Como funciona</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                  <li>
                    O sistema calcula o repasse automaticamente para cada atendimento pago (% ou
                    valor fixo do cadastro do médico).
                  </li>
                  <li>
                    Selecione vários atendimentos e use{" "}
                    <strong>"Pagar repasse selecionados"</strong> — o sistema agrupa por médico e
                    gera <strong>uma despesa por médico</strong>.
                  </li>
                  <li>
                    O lançamento entra como <strong>despesa em dinheiro</strong> no financeiro,
                    vinculado ao seu caixa do dia.
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <h4 className="font-medium">Repasses realizados hoje</h4>
                  <p className="text-xs text-muted-foreground">
                    Lista de pagamentos efetuados no dia, por médico.
                  </p>
                </div>
                {repPagosHoje.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum repasse pago hoje.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead>Médico</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repPagosHoje.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-muted-foreground">{r.hora ?? "—"}</TableCell>
                          <TableCell className="font-medium">{r.medico}</TableCell>
                          <TableCell className="capitalize">{r.forma ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                            {fmt(r.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={3} className="text-right font-medium">
                          Total
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {fmt(repPagosHoje.reduce((s, r) => s + r.valor, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild size="lg" className="bg-emerald-600 hover:bg-emerald-700">
                  <Link to="/app/financeiro/atendimentos">
                    <HandCoins className="h-4 w-4 mr-2" />
                    Abrir tela completa de Repasse
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => void loadRepasseHoje()}>
                  Atualizar resumo
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* === Modal Abrir === */}
      <Dialog open={openAbrir} onOpenChange={setOpenAbrir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir caixa</DialogTitle>
          </DialogHeader>
          <form onSubmit={abrirCaixa} className="space-y-3">
            <div>
              <Label>Valor de abertura (fundo de troco)</Label>
              <CurrencyInput value={valorAbertura} onChange={setValorAbertura} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={obsAbertura} onChange={(e) => setObsAbertura(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenAbrir(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-primary>
                Abrir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Movimento === */}
      <Dialog
        open={!!openMov}
        onOpenChange={(o) => {
          if (!o) setOpenMov(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openMov ? TIPO_LABEL[openMov.tipo] : ""}</DialogTitle>
            <DialogDescription>
              {openMov?.tipo === "sangria" && "Retirada de dinheiro do caixa."}
              {openMov?.tipo === "suprimento" && "Adição de dinheiro ao caixa."}
              {openMov?.tipo === "recebimento" && "Entrada de pagamento avulsa."}
              {openMov?.tipo === "despesa" && "Pagamento avulso de despesa pelo caixa."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={lancarMov} className="space-y-3">
            <div>
              <Label>Valor</Label>
              <CurrencyInput value={movValor} onChange={setMovValor} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={movDesc}
                onChange={(e) => setMovDesc(e.target.value)}
                placeholder="Motivo / referência"
              />
            </div>
            {openMov && (openMov.tipo === "sangria" || openMov.tipo === "suprimento") && (
              <div>
                <Label>{openMov.tipo === "sangria" ? "Entregue a *" : "Recebido de *"}</Label>
                <Select value={movDestinoUserId} onValueChange={setMovDestinoUserId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o usuário..." /></SelectTrigger>
                  <SelectContent>
                    {membrosClinica.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {openMov.tipo === "sangria"
                    ? "Registre a quem o dinheiro está sendo entregue (ex.: financeiro, gestor)."
                    : "Registre de quem o dinheiro está sendo recebido."}
                </p>
              </div>
            )}
            {openMov && (openMov.tipo === "recebimento" || openMov.tipo === "despesa") && (
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={movForma} onValueChange={setMovForma}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="debito">Débito</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {openMov &&
              (openMov.tipo === "recebimento" || openMov.tipo === "despesa") &&
              (movForma === "credito" || movForma === "debito") && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Bandeira *</Label>
                    <Select value={movBandeira} onValueChange={setMovBandeira}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {BANDEIRAS_CARTAO.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {movForma === "credito" && (
                    <div>
                      <Label>Parcelas</Label>
                      <Select value={movParcelas} onValueChange={setMovParcelas}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}x
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenMov(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-primary>
                Lançar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Fechar === */}
      <Dialog open={openFechar} onOpenChange={setOpenFechar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
            <DialogDescription>
              Saldo calculado: <strong>{fmt(saldoAtual)}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={fecharCaixa} className="space-y-3">
            <div>
              <Label>Valor conferido em caixa</Label>
              <CurrencyInput value={valorInformado} onChange={setValorInformado} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={obsFechamento} onChange={(e) => setObsFechamento(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenFechar(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={saving} data-primary>
                Confirmar fechamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Cobrança === */}
      <Dialog
        open={!!openCobranca}
        onOpenChange={(o) => {
          if (!o) setOpenCobranca(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobrar paciente</DialogTitle>
            {openCobranca && (
              <DialogDescription>
                <span className="uppercase font-medium">{openCobranca.paciente_nome}</span>
                {openCobranca.procedimento ? ` · ${openCobranca.procedimento}` : ""}
              </DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={cobrar} className="space-y-3">
            <p className="text-[11px] text-muted-foreground -mt-2">
              Atalhos: <kbd className="px-1 border rounded">1</kbd> dinheiro ·{" "}
              <kbd className="px-1 border rounded">2</kbd> PIX ·{" "}
              <kbd className="px-1 border rounded">3</kbd> débito ·{" "}
              <kbd className="px-1 border rounded">4</kbd> crédito ·{" "}
              <kbd className="px-1 border rounded">5</kbd> adicionar forma ·{" "}
              <kbd className="px-1 border rounded">Enter</kbd> confirmar
            </p>
            {(() => {
              const total = cobrancaLinhas.reduce((a, l) => a + (Number(l.valor) || 0), 0);
              const multi = cobrancaLinhas.length > 1;
              const sugerido = openCobranca
                ? multi
                  ? openCobranca.valor_cartao
                  : openCobranca.valor
                : 0;
              const dif = total - sugerido;
              return (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Sugerido{" "}
                    <b className="text-foreground">({multi ? "cartão" : "dinheiro/PIX"})</b>:{" "}
                    <b>{fmt(sugerido)}</b>
                  </span>
                  <span>
                    Soma:{" "}
                    <b className={Math.abs(dif) < 0.01 ? "text-emerald-600" : "text-amber-600"}>
                      {fmt(total)}
                    </b>
                  </span>
                </div>
              );
            })()}
            <div className="space-y-3">
              {cobrancaLinhas.map((l, idx) => (
                <div key={idx} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Pagamento {idx + 1}
                    </span>
                    {cobrancaLinhas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-rose-600"
                        onClick={() =>
                          setCobrancaLinhas((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Forma</Label>
                      <Select
                        value={l.forma}
                        onValueChange={(v) =>
                          setCobrancaLinhas((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, forma: v, bandeira: "", parcelas: "1" } : x,
                            ),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="debito">Débito</SelectItem>
                          <SelectItem value="credito">Crédito</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Valor</Label>
                      <CurrencyInput
                        value={l.valor}
                        onChange={(v) =>
                          setCobrancaLinhas((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, valor: v } : x)),
                          )
                        }
                      />
                    </div>
                  </div>
                  {(l.forma === "credito" || l.forma === "debito") && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Bandeira *</Label>
                        <Select
                          value={l.bandeira}
                          onValueChange={(v) =>
                            setCobrancaLinhas((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, bandeira: v } : x)),
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {BANDEIRAS_CARTAO.map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {l.forma === "credito" && (
                        <div>
                          <Label>Parcelas</Label>
                          <Select
                            value={l.parcelas}
                            onValueChange={(v) =>
                              setCobrancaLinhas((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, parcelas: v } : x)),
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                  {n}x
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setCobrancaLinhas((prev) => {
                    // ao passar para multi-forma, ajusta a primeira linha (se ainda no valor original em dinheiro)
                    // para usar o valor de cartão sugerido, e adiciona linha nova com valor 0
                    if (!openCobranca) return [...prev, linhaVazia()];
                    const next = [...prev];
                    if (prev.length === 1) {
                      const atual = Number(prev[0].valor) || 0;
                      if (Math.abs(atual - openCobranca.valor) < 0.01) {
                        next[0] = { ...prev[0], valor: String(openCobranca.valor_cartao || atual) };
                      }
                    }
                    next.push(linhaVazia());
                    return next;
                  });
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar forma de pagamento
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Será criado: movimento de caixa + lançamento financeiro (receita) + paciente avança
              para <b>triagem</b>.
            </p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenCobranca(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} data-primary>
                Confirmar cobrança
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Detalhe === */}
      <Dialog
        open={!!openDetalhe}
        onOpenChange={(o) => {
          if (!o) {
            setOpenDetalhe(null);
            setDetalheMovs([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-8">
              <DialogTitle>Sessão de caixa</DialogTitle>
              {openDetalhe && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={exportarDetalhe}>
                    <FileDown className="h-4 w-4 mr-1" /> Excel
                  </Button>
                  <Button size="sm" variant="outline" onClick={imprimirDetalhe}>
                    <Printer className="h-4 w-4 mr-1" /> Imprimir
                  </Button>
                </div>
              )}
            </div>
            {openDetalhe && (
              <DialogDescription>
                {openDetalhe.user_nome || "—"} · {fmtDT(openDetalhe.aberto_em)} →{" "}
                {fmtDT(openDetalhe.fechado_em)}
              </DialogDescription>
            )}
          </DialogHeader>
          {openDetalhe && (
            <div className="space-y-3">
              {(() => {
                const tot = { recebimento: 0, sangria: 0, estorno: 0 };
                let qtdReceb = 0;
                detalheMovs.forEach((m) => {
                  const v = Number(m.valor || 0);
                  if (m.tipo === "recebimento") {
                    tot.recebimento += v;
                    qtdReceb++;
                  } else if (m.tipo === "sangria") tot.sangria += v;
                  if ((m.descricao ?? "").toLowerCase().includes("estorno")) tot.estorno += v;
                });
                const diff = Number(openDetalhe.diferenca || 0);
                const media = qtdReceb > 0 ? tot.recebimento / qtdReceb : 0;
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/40 p-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Abertura
                        </p>
                        <p className="text-base font-bold text-slate-700 dark:text-slate-200">
                          {fmt(openDetalhe.valor_abertura)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Recebimentos
                        </p>
                        <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                          {fmt(tot.recebimento)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {qtdReceb} lançamento{qtdReceb === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Sangrias
                        </p>
                        <p className="text-base font-bold text-amber-700 dark:text-amber-400">
                          {fmt(tot.sangria)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/30 p-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Média / atendimento
                        </p>
                        <p className="text-base font-bold text-sky-700 dark:text-sky-400">
                          {fmt(media)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {qtdReceb} atendimento{qtdReceb === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-fuchsia-50 dark:bg-fuchsia-950/30 p-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Estornos
                        </p>
                        <p className="text-base font-bold text-fuchsia-700 dark:text-fuchsia-400">
                          {fmt(tot.estorno)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm rounded-lg border bg-muted/30 p-3">
                      <div>
                        <span className="text-muted-foreground">Calculado:</span>{" "}
                        <strong>{fmt(openDetalhe.valor_fechamento_calculado)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Informado:</span>{" "}
                        <strong>{fmt(openDetalhe.valor_fechamento_informado)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Diferença:</span>{" "}
                        <strong
                          className={diff < 0 ? "text-rose-600" : diff > 0 ? "text-amber-600" : ""}
                        >
                          {fmt(diff)}
                        </strong>
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalheMovs.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(m.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TIPO_CLASS[m.tipo]}>
                            {TIPO_LABEL[m.tipo]}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.descricao || "—"}</TableCell>
<<<<<<< HEAD
                        <TableCell>{m.forma_pagamento || "—"}</TableCell>
                        <TableCell
                          className={`text-right ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}
                        >
                          {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                          {fmt(m.valor)}
=======
                        <TableCell className="text-xs">{formatarFormaPagamento(m, mistoObs)}</TableCell>
                        <TableCell className={`text-right ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}>
                          {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}{fmt(m.valor)}
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SolicitarEstornoDialog
        open={!!estornoFor}
        onOpenChange={(v) => {
          if (!v) setEstornoFor(null);
        }}
        descricao={estornoFor?.descricao ?? null}
        valor={estornoFor?.valor ?? null}
        lancamentoId={estornoFor?.lancamento_id ?? null}
        pacienteNome={(() => {
          const d = estornoFor?.descricao ?? "";
          // Formato esperado: "NOME PACIENTE — PROCEDIMENTO"
          const idx = d.indexOf("—");
          return idx > 0 ? d.slice(0, idx).trim() : null;
        })()}
        onCreated={() => { void reloadEstornosPendentes(); }}
      />
      <Dialog
        open={!!caixaDrill}
        onOpenChange={(v) => {
          if (!v) setCaixaDrill(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {caixaDrill === "saldo" && "Detalhamento do saldo atual"}
              {caixaDrill === "abertura" && "Abertura do caixa"}
              {caixaDrill === "entradas" && "Entradas do caixa"}
              {caixaDrill === "saidas" && "Saídas do caixa"}
            </DialogTitle>
            <DialogDescription>
              {caixaDrill === "saldo" && "Todas as movimentações da sessão atual."}
              {caixaDrill === "abertura" && "Valor e observações da abertura."}
              {caixaDrill === "entradas" && "Recebimentos e suprimentos."}
              {caixaDrill === "saidas" && "Despesas e sangrias."}
            </DialogDescription>
          </DialogHeader>
          {caixaDrill === "abertura" && minhaSessao && (
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Aberto em:</span>{" "}
                {fmtDT(minhaSessao.aberto_em)}
              </div>
              <div>
                <span className="text-muted-foreground">Valor de abertura:</span>{" "}
                <span className="font-semibold">{fmt(minhaSessao.valor_abertura)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Operador:</span>{" "}
                {minhaSessao.user_nome ?? "—"}
              </div>
              {minhaSessao.observacoes && (
                <div>
                  <span className="text-muted-foreground">Observações:</span>{" "}
                  {minhaSessao.observacoes}
                </div>
              )}
            </div>
          )}
          {caixaDrill && caixaDrill !== "abertura" && (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {minhasMovs
                    .filter((m) => {
                      if (caixaDrill === "entradas")
                        return m.tipo === "suprimento" || m.tipo === "recebimento";
                      if (caixaDrill === "saidas")
                        return m.tipo === "sangria" || m.tipo === "despesa";
                      return true;
                    })
                    .map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{fmtDT(m.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TIPO_CLASS[m.tipo]}>
                            {TIPO_LABEL[m.tipo]}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.descricao ?? "—"}</TableCell>
<<<<<<< HEAD
                        <TableCell>{m.forma_pagamento ?? "—"}</TableCell>
                        <TableCell
                          className={`text-right font-semibold ${TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : ""}`}
                        >
                          {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                          {fmt(m.valor)}
=======
                        <TableCell className="text-xs">{formatarFormaPagamento(m, mistoObs)}</TableCell>
                        <TableCell className={`text-right font-semibold ${TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : ""}`}>
                          {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}{fmt(m.valor)}
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
