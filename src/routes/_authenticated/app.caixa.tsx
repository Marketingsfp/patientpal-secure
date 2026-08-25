import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
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
  Undo2,
  Printer,
  CalendarIcon,
  X,
  Search,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { hojeBR } from "@/lib/date-utils";
import { precoAtendimentoParaCaixa, type PrecoCaixa } from "@/lib/convenio/info-convenio-paciente";
import { useClinica } from "@/hooks/use-clinica";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
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
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { SolicitarEstornoDialog } from "@/components/financeiro/SolicitarEstornoDialog";
import { useCaixaV2Flag } from "@/hooks/use-caixa-v2-flag";
import { CaixaV2Mount } from "@/components/caixa-v2/caixa-v2-mount";
import { useAutoReloadOnNewBuild } from "@/hooks/use-auto-reload-on-new-build";
import { printComprovanteCaixa } from "@/lib/print-caixa-comprovante";
import { ResumoFormas } from "@/components/caixa/resumo-formas";
import { TimelineGaveta } from "@/components/caixa/timeline-gaveta";
import {
  saldoEsperadoGaveta,
  saldoDeMovimentos,
  SINAL_NO_SALDO,
  classificarDiferenca,
  totalConferido,
  statusCaixa,
  STATUS_CAIXA_LABEL,
  STATUS_CAIXA_CLASS,
} from "@/lib/caixa/fechamento";
import {
  FORMA_PAGO_SISTEMA_ANTERIOR,
  LABEL_PAGO_SISTEMA_ANTERIOR,
} from "@/lib/financeiro/formas-pagamento";

import { DateInputBR } from "@/components/ui/date-input-br";
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
const FORMA_BUCKETS = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "boleto",
  "transferencia",
  "convenio",
] as const;
type FormaBucket = (typeof FORMA_BUCKETS)[number] | "misto" | "outros" | "indeterminado";

/** Chaves de forma que os quadros de conferência sempre inicializam em zero. */
const CHAVES_FORMA = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "boleto",
  "transferencia",
  "convenio",
  "outros",
  "indeterminado",
] as const;

/**
 * O que entrou e o que saiu de uma forma de pagamento no período.
 *
 * Guardar os dois lados separados (em vez de só o líquido) é o que permite ao
 * comprovante impresso mostrar "Dinheiro: entrou 9.550,55, saiu 9.550,55,
 * saldo 0,00" em vez de simplesmente omitir a linha por ela ter fechado em
 * zero depois das sangrias.
 */
interface EntradaSaida {
  entradas: number;
  saidas: number;
}

function normalizarForma(f: string | null | undefined): FormaBucket {
  const k = (f ?? "").toLowerCase().trim();
  if (!k) return "outros";
  if (
    k === "dinheiro" ||
    k === "pix" ||
    k === "boleto" ||
    k === "transferencia" ||
    k === "convenio" ||
    k === "misto"
  )
    return k;
  if (k === "credito" || k === "cartao_credito" || k === "cartão_credito" || k === "cartao credito")
    return "credito";
  if (k === "debito" || k === "cartao_debito" || k === "cartão_debito" || k === "cartao debito")
    return "debito";
  return "outros";
}

/**
 * Bucket efetivo do movimento para agrupamento por forma de pagamento.
 * Sangria, suprimento e despesa mexem no dinheiro físico do caixa: quando
 * chegam sem `forma_pagamento`, contam como "dinheiro" (em vez de cair em
 * "outros"). Se, no futuro, algum desses lançamentos vier com forma
 * explícita, a forma informada é respeitada.
 */
function bucketDeMov(m: { tipo: string; forma_pagamento: string | null }): FormaBucket {
  const bruto = normalizarForma(m.forma_pagamento);
  if (
    bruto === "outros" &&
    (m.tipo === "sangria" || m.tipo === "suprimento" || m.tipo === "despesa")
  ) {
    return "dinheiro";
  }
  return bruto;
}

/**
 * Extrai as parcelas de um pagamento misto a partir do trecho
 * `Pagamento misto: Dinheiro R$ 60,00; PIX R$ 50,00 | ...` gravado em
 * `fin_lancamentos.observacoes`. Retorna somas por bucket já normalizado.
 */
function decomporMistoObs(obs: string | null | undefined): Partial<Record<FormaBucket, number>> {
  const out: Partial<Record<FormaBucket, number>> = {};
  if (!obs) return out;
  const marker = obs.match(/pagamento\s+misto\s*:/i);
  if (!marker || marker.index == null) return out;
  const trecho = obs.slice(marker.index + marker[0].length).split(/\s+\|\s+/)[0];
  const partes = trecho
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
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
  const parseBRL = (s: string) => Number(s.replace(/[.\s\u00a0]/g, "").replace(",", ".")) || 0;
  for (const p of partes) {
    const match = LABEL_TO_KEY.find(([re]) => re.test(p));
    if (!match) continue;
    const valMatch = p.match(/R\$[\s\u00a0]*([\d.\s\u00a0]+,\d{2})/i);
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
 * ainda em cache, retorna um aviso temporário sem usar o rótulo misto.
 */
const FORMA_LABEL: Record<FormaBucket, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão débito",
  credito: "Cartão crédito",
  boleto: "Boleto",
  transferencia: "Transferência",
  convenio: "Convênio",
  misto: "Misto",
  outros: "Outros",
  indeterminado: "Indeterminado (conferir)",
};

/**
 * Falha 2.8 — decomposição do "misto" a partir de DADO ESTRUTURADO
 * (`fin_lancamentos.composicao_pagamento`). O texto da observação vira
 * apenas fallback legado. Retorna `null` quando não há fonte confiável —
 * nesse caso o valor NUNCA deve ser contabilizado como Dinheiro.
 */
function partesDaComposicao(comp: unknown): Partial<Record<FormaBucket, number>> | null {
  if (!comp || typeof comp !== "object") return null;
  const arr = (comp as { partes?: unknown }).partes;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: Partial<Record<FormaBucket, number>> = {};
  for (const p of arr as Array<{ forma?: string; valor?: number | string }>) {
    const b = normalizarForma(p?.forma);
    const v = Number(p?.valor ?? 0);
    if (!v || b === "misto") continue;
    out[b] = (out[b] ?? 0) + v;
  }
  return Object.keys(out).length ? out : null;
}
function formatarFormaPagamento(
  m: { forma_pagamento: string | null; lancamento_id?: string | null },
  mistoObs: Record<string, string>,
): string {
  const bucket = normalizarForma(m.forma_pagamento);
  if (bucket !== "misto") return m.forma_pagamento || "—";
  const obs = m.lancamento_id ? mistoObs[m.lancamento_id] : undefined;
  const partes = obs ? decomporMistoObs(obs) : {};
  const entradas = Object.entries(partes).filter(([, v]) => (v ?? 0) > 0);
  if (entradas.length === 0) return "Aguardando formas";
  return entradas
    .map(
      ([k, v]) =>
        `${FORMA_LABEL[k as FormaBucket] ?? k} ${(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    )
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
  // `?classico=1` força a tela clássica (usado pelos botões do caixa novo
  // que delegam ações ao clássico). Sem isso, navegar para /app/caixa
  // continuava caindo no caixa novo e "nada acontecia".
  const forcaClassico =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("classico") === "1";
  // Detecta novo bundle publicado enquanto a tela do Caixa está aberta e
  // recarrega automaticamente — evita a necessidade de Ctrl+Shift+R.
  useAutoReloadOnNewBuild(true);
  const role = clinicaAtual?.role ?? null;
  const v2Allowed = role === "admin" || role === "gestor";
  if (!forcaClassico && !loading && enabled && v2Allowed) return <CaixaV2Mount />;
  return <Page />;
}

type MovTipo =
  | "abertura"
  | "sangria"
  | "suprimento"
  | "recebimento"
  | "despesa"
  | "fechamento"
  | "estorno"
  | "reabertura";
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
type MovEnrich = {
  servico: string | null;
  medico: string | null;
  paciente: string | null;
  paciente_id: string | null;
  ficha: number | null;
  /** ID do usuário que faturou (fin_lancamentos.criado_por) — pode diferir
   *  do operador de caixa (caixa_movimentos.user_id) em cobranças
   *  centralizadas. Usado para exibir "Quem faturou" na coluna Usuário. */
  faturado_por_id: string | null;
};
type LancamentoEnrichRow = {
  id: string;
  medico_id: string | null;
  agendamento_id: string | null;
  paciente_id: string | null;
  descricao: string | null;
  status: string | null;
  criado_por: string | null;
};
type AgendamentoEnrichRow = {
  id: string;
  procedimento: string | null;
  paciente_id: string | null;
  medico_id: string | null;
  ficha_numero: number | null;
  inicio: string | null;
  agenda_id: string | null;
  paciente_nome: string | null;
};
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
  estorno: "Estorno",
  reabertura: "Reabertura",
};
/**
 * Sinal de EXIBIÇÃO de cada movimento nas tabelas e no comprovante: define a
 * cor da linha e se o valor sai com "−" na frente. A abertura aparece como
 * entrada porque é assim que o operador a lê no extrato.
 *
 * Para SOMAR o saldo de um caixa use `saldoDeMovimentos`/`SINAL_NO_SALDO` de
 * `@/lib/caixa/fechamento`, onde a abertura vale zero — o troco não é receita
 * do dia. Manter as duas contas separadas e nomeadas é o que impede o saldo de
 * divergir do fechamento.
 */
const TIPO_SINAL: Record<MovTipo, 1 | -1 | 0> = {
  abertura: 1,
  suprimento: 1,
  recebimento: 1,
  sangria: -1,
  despesa: -1,
  fechamento: 0,
  estorno: -1,
  reabertura: 0,
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
  estorno:
    "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:border-fuchsia-800",
  reabertura:
    "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
};

/**
 * Versão suavizada de TIPO_CLASS para a tabela do modal "Sessão de caixa".
 *
 * Ali a badge é só um rótulo de categoria: quem carrega a informação é o valor,
 * à direita. Fundo saturado em toda linha competia com ele e deixava a tabela
 * pesada. Mantém o mesmo matiz de TIPO_CLASS para não reeducar o olho de quem
 * já usa as outras telas — só baixa a intensidade do fundo e da borda.
 */
const TIPO_CLASS_SUAVE: Record<MovTipo, string> = {
  abertura: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300",
  suprimento:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
  recebimento:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300",
  sangria: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  despesa: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300",
  fechamento:
    "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300",
  estorno:
    "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  reabertura:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300",
};

const SESSAO_FIELDS =
  "id, clinica_id, user_id, user_nome, aberto_em, valor_abertura, fechado_em, valor_fechamento_informado, valor_fechamento_calculado, diferenca, status, observacoes";
const MOV_FIELDS =
  "id, sessao_id, user_id, tipo, valor, descricao, forma_pagamento, created_at, lancamento_id";

/**
 * Movimentos do caixa incluindo o dono da sessão, para poder filtrar por ele.
 *
 * O recorte de "Meu caixa" é por DONO DA SESSÃO, e não por
 * `caixa_movimentos.user_id`: quando um gestor fecha o caixa de outra pessoa,
 * a linha de fechamento fica gravada na sessão dela com o user_id do gestor.
 */
const MOV_FIELDS_COM_SESSAO = `${MOV_FIELDS}, caixa_sessoes!inner(user_id)`;

/** Teto de linhas por consulta de movimentos (o PostgREST corta em 1.000). */
const LIMITE_MOVS = 2000;

/** Teto de dias recalculados para a coluna "Ficha" em períodos largos. */
const LIMITE_DIAS_FICHA = 45;

/** "YYYY-MM-DD" no fuso local a partir de um ISO. */
function localYMDStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    return (
      clean
        .slice(idx + 3)
        .replace(/\s*\(.*\)\s*$/, "")
        .trim() || null
    );
  }
  return null;
}

/** Extrai o nome do paciente da descrição de um movimento como fallback,
 *  quando não há enriquecimento via fin_lancamentos.paciente_id. Aceita
 *  os formatos usados nos diversos caminhos de escrita: cobrança
 *  (`NOME — SERVIÇO (ESPECIALIDADE)` / `NOME · SERVIÇO`), mensalidade
 *  (`MENSALIDADE X/Y - CONTRATO #Z - NOME`) e recebimento genérico
 *  (`Recebimento — NOME (SERVIÇO)`). Retorna null quando o texto não
 *  contém um nome identificável (sangrias, aberturas, [Caixa] livres). */
function pacienteFromDescricao(desc: string | null): string | null {
  if (!desc) return null;
  // Mensalidade de contrato: nome fica no fim, depois do último " - "
  const mens = desc.match(/CONTRATO\s+#\S+\s+-\s+(.+?)\s*$/i);
  if (mens) return mens[1].trim() || null;
  // Descarta descrições sem paciente (sangria/suprimento/fechamento/etc.)
  if (
    /^\s*(abertura|fechamento|reabertura|sangria|suprimento|estorno|fechamento\s+desfeito)\b/i.test(
      desc,
    )
  )
    return null;
  if (/^\s*\[caixa\]/i.test(desc)) return null;
  const clean = desc.replace(/^Recebimento\s+—\s+/i, "");
  // Nome vem antes do PRIMEIRO separador " — " ou " · "
  const seps = [" — ", " · "];
  let idx = -1;
  for (const s of seps) {
    const i = clean.indexOf(s);
    if (i > 0 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx > 0) {
    const nome = clean.slice(0, idx).trim();
    if (!nome || /^mensalidade/i.test(nome)) return null;
    return nome;
  }
  return null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function saoPauloDayKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function saoPauloDayRange(day: string): { start: string; end: string } {
  return {
    start: `${day}T00:00:00.000-03:00`,
    end: `${day}T23:59:59.999-03:00`,
  };
}

function formatFichaCaixa(ficha: number | null | undefined): string {
  return typeof ficha === "number" && ficha > 0 ? String(ficha).padStart(3, "0") : "—";
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
  const podeLancarRecebDespesa =
    clinicaAtual?.role === "admin" ||
    clinicaAtual?.role === "gestor" ||
    clinicaAtual?.role === "financeiro";

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
  /**
   * TODAS as sessões abertas do próprio usuário, da mais recente para a mais
   * antiga.
   *
   * Antes a tela carregava só a mais recente (`limit(1)`). Como o registro de
   * pagamento abre uma sessão nova quando não existe uma daquele DIA
   * (fn_registrar_lancamento_e_caixa), quem não fechou o caixa na véspera
   * chegava no dia seguinte, recebia um caixa novo e o da véspera sumia da
   * tela — sem aviso e sem como fechá-lo a não ser pedindo a um gestor. Em
   * 22/08/2026 havia 10 caixas nesse estado, o mais antigo de 20/05.
   */
  const [sessoesAbertas, setSessoesAbertas] = useState<Sessao[]>([]);
  /**
   * Qual das sessões abertas a aba "Meu caixa" está exibindo. `null` = a mais
   * recente (o caixa de hoje), que é o comportamento normal do dia a dia.
   */
  const [sessaoAtivaId, setSessaoAtivaId] = useState<string | null>(null);
  const [minhasMovs, setMinhasMovs] = useState<Mov[]>([]);
  // Movimentos do próprio usuário ao longo das ~20 sessões mais recentes
  // (aberta + fechadas). Usado APENAS na aba "Meu caixa → Movimentos" para
  // permitir visualizar/estornar lançamentos retroativos. NÃO é usado nos
  // cálculos de Saldo/Totais — esses continuam presos à sessão aberta atual
  // via `minhasMovs`.
  const [minhasMovsHist, setMinhasMovsHist] = useState<Mov[]>([]);
  /** Verdadeiro quando a consulta do período bateu no teto de linhas. */
  const [movsNoTeto, setMovsNoTeto] = useState(false);
  const [minhasSessoes, setMinhasSessoes] = useState<Sessao[]>([]);
  // Solicitações de estorno vinculadas às movimentações visíveis
  // (chave = lancamento_id, valor = status). Usado para trocar o botão
  // "Solicitar estorno" por "Aguardando aprovação" (pendente) ou
  // "Estornado" (aprovado) conforme a decisão do financeiro.
  const [estornosPorLanc, setEstornosPorLanc] = useState<Map<string, "pendente" | "aprovado">>(
    new Map(),
  );
  // Espelho do estornosPorLanc, mas indexado por caixa_movimento_id — usado
  // para o botão de estorno de sangria (que não tem lançamento financeiro).
  const [estornosPorMov, setEstornosPorMov] = useState<Map<string, "pendente" | "aprovado">>(
    new Map(),
  );
  const [enrichPorLanc, setEnrichPorLanc] = useState<Map<string, MovEnrich>>(new Map());
  // Mapa user_id → nome de exibição. Alimenta a coluna "Usuário" (quem
  // faturou) em Movimentos, no Detalhe de sessão, no drill-down do saldo
  // e na exportação/impressão. Cobre tanto o operador do caixa
  // (caixa_movimentos.user_id) quanto o autor do lançamento financeiro
  // (fin_lancamentos.criado_por) — que podem divergir em cobranças
  // centralizadas (ex.: financeiro/laboratório).
  const [userNamesById, setUserNamesById] = useState<Map<string, string>>(new Map());
  /**
   * Lançamentos ANULADOS: cancelados no financeiro E com a devolução já
   * registrada no caixa (movimento de estorno, ou sangria antiga descrita
   * como "Estorno —"). Só esses formam um par que se anula.
   *
   * A versão anterior guardava todo lançamento cancelado, com ou sem reverso,
   * e o saldo descontava o valor de qualquer jeito. Mas cancelar no financeiro
   * não tira dinheiro da gaveta: sem estorno registrado, a cédula continua
   * lá. O resultado era o card "Saldo atual" e a grade "Conferência por forma
   * de pagamento" mostrando números diferentes do MESMO caixa — em 22/08/2026
   * eram 42 recebimentos nessa situação, R$ 7.164,00, e no caixa aberto da
   * Fadila o card dizia R$ 890,00 enquanto o fechamento dizia R$ 1.490,00.
   * Quem fechava via um número e gravava outro.
   */
  const [lancsAnulados, setLancsAnulados] = useState<Set<string>>(new Set());
  // Filtro de período para "Movimentos" (padrão: hoje)
  type PeriodoFiltro = "hoje" | "semana" | "quinzena" | "mes" | "intervalo" | "todos";
  const [meuPeriodo, setMeuPeriodo] = useState<PeriodoFiltro>("hoje");
  const [meuDataIni, setMeuDataIni] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [meuDataFim, setMeuDataFim] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [meuMedico, setMeuMedico] = useState<string>("__all__");
  const [meuPaciente, setMeuPaciente] = useState<string>("");
  const [openCal, setOpenCal] = useState(false);
  /**
   * Janela de datas do filtro "Período" da aba Movimentos.
   *
   * Ficou fora do useMemo da lista porque agora ela manda em DUAS coisas: no
   * recorte feito na tela e, principalmente, no que é buscado no banco.
   *
   * Antes o período só recortava o que já estava carregado — e o que estava
   * carregado eram as 5 últimas sessões de caixa do usuário. Escolher "Mês",
   * "Todos" ou um intervalo antigo devolvia lista vazia mesmo existindo
   * movimento: o recebimento de um caixa de abril, por exemplo, nunca chegava
   * a ser buscado.
   *
   * `null` = "Todos" (sem recorte de data).
   */
  const janelaMeusMovs = useMemo<{ ini: Date; fim: Date } | null>(() => {
    if (meuPeriodo === "todos") return null;
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
      // Validação defensiva: se o intervalo estiver em branco/mal
      // formatado, cai para o dia de hoje em vez de gerar Date(NaN)
      // e sumir com todas as linhas silenciosamente.
      const parseIso = (s: string): [number, number, number] | null => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
        if (!m) return null;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (!y || !mo || !d) return null;
        return [y, mo, d];
      };
      const pi = parseIso(meuDataIni);
      const pf = parseIso(meuDataFim);
      if (pi) ini = new Date(pi[0], pi[1] - 1, pi[2], 0, 0, 0, 0);
      else ini = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      if (pf) fimP = new Date(pf[0], pf[1] - 1, pf[2], 23, 59, 59, 999);
    }
    return { ini, fim: fimP };
  }, [meuPeriodo, meuDataIni, meuDataFim]);

  // A janela vira string para entrar nas dependências do `load`: um objeto
  // Date muda de identidade a cada render e refaria a consulta sem parar.
  const janelaIniISO = janelaMeusMovs ? janelaMeusMovs.ini.toISOString() : null;
  const janelaFimISO = janelaMeusMovs ? janelaMeusMovs.fim.toISOString() : null;

  const minhasMovsFiltrados = useMemo<Mov[]>(() => {
    // 1) filtro de período (data)
    let base: Mov[] = minhasMovsHist;
    if (janelaMeusMovs) {
      const { ini, fim: fimP } = janelaMeusMovs;
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
    // 3) filtro por paciente — usa o nome enriquecido de fin_lancamentos
    // (fonte de verdade) com fallback para a descrição do próprio
    // movimento. Assim, mensalidades e recebimentos manuais sem o nome
    // no texto continuam encontráveis quando existe vínculo real.
    const termo = meuPaciente.trim().toLocaleLowerCase("pt-BR");
    if (termo) {
      base = base.filter((m) => {
        const enr = m.lancamento_id ? enrichPorLanc.get(m.lancamento_id) : undefined;
        const nomeEnr = (enr?.paciente ?? "").toLocaleLowerCase("pt-BR");
        if (nomeEnr && nomeEnr.includes(termo)) return true;
        const desc = (m.descricao ?? "").toLocaleLowerCase("pt-BR");
        return desc.includes(termo);
      });
    }
    return base;
  }, [minhasMovsHist, janelaMeusMovs, meuMedico, meuPaciente, enrichPorLanc]);

  // Lista de médicos distintos presentes nos movimentos carregados.
  const medicosDisponiveis = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const m of minhasMovsHist) {
      const enr = m.lancamento_id ? enrichPorLanc.get(m.lancamento_id) : undefined;
      const nome = (enr?.medico ?? "").trim();
      if (nome) set.add(nome);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [minhasMovsHist, enrichPorLanc]);

  const filtrosAtivos =
    meuPeriodo !== "hoje" || meuMedico !== "__all__" || meuPaciente.trim() !== "";
  // Nota: o rótulo "(X de N)" e o botão "Limpar" continuam válidos
  // porque `meuPeriodo === "intervalo"` também difere de "hoje".
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
  /** Papel do comprovante de fechamento. Continua em bobina 80mm por padrão:
   *  o fechamento é impresso numa impressora diferente da que a recepção usa
   *  para os recibos do financeiro (esses sim vão para folha A4). Quem quiser
   *  a folha A4 troca no seletor deste diálogo. */
  const [formatoFechamento, setFormatoFechamento] = useState<"80mm" | "a4">("80mm");
  const [openDetalhe, setOpenDetalhe] = useState<Sessao | null>(null);
  const [detalheMovs, setDetalheMovs] = useState<Mov[]>([]);
  const [filaCaixa, setFilaCaixa] = useState<FilaCaixa[]>([]);
  const [openCobranca, setOpenCobranca] = useState<FilaCaixa | null>(null);
  /**
   * Uma forma de pagamento da cobrança. `pagoEm`/`recibo` só valem para a
   * forma "pago no sistema anterior" (transição da Clínica Total): guardam o
   * dia em que o paciente pagou lá atrás e o número do recibo antigo, que é
   * todo o rastro que liga esta guia àquele recebimento.
   */
  type LinhaPag = {
    forma: string;
    valor: string;
    bandeira: string;
    parcelas: string;
    pagoEm?: string;
    recibo?: string;
  };
  const linhaVazia = (): LinhaPag => ({
    forma: "dinheiro",
    valor: "0",
    bandeira: "",
    parcelas: "1",
    pagoEm: "",
    recibo: "",
  });
  const [cobrancaLinhas, setCobrancaLinhas] = useState<LinhaPag[]>([linhaVazia()]);
  /**
   * Preço do atendimento recalculado pelo motor de convênio da Agenda ao abrir
   * a cobrança. A fila é montada por uma função do banco que só faz uma conta
   * aproximada; o valor que vale é este.
   */
  const [precoCobranca, setPrecoCobranca] = useState<PrecoCaixa | null>(null);
  const [calculandoPreco, setCalculandoPreco] = useState(false);
  /** Guarda qual cobrança está sendo calculada, para descartar resposta atrasada. */
  const precoPedidoRef = useRef<string | null>(null);

  // Edição inline da "Forma" nas tabelas de Movimentos. Só liberada para
  // quem tem permissão de escrita no módulo caixa e apenas para movimentos
  // simples (não-mistos), em tipos que fazem sentido (recebimento, despesa,
  // estorno). Atualiza tanto `caixa_movimentos.forma_pagamento` quanto o
  // `fin_lancamentos.forma_pagamento` associado (quando existir), para que
  // relatórios financeiros e resumos por moeda fiquem coerentes.
  const FORMAS_EDITAVEIS: Array<{ value: string; label: string }> = [
    { value: "dinheiro", label: "Dinheiro" },
    { value: "pix", label: "PIX" },
    { value: "cartao_debito", label: "Cartão débito" },
    { value: "cartao_credito", label: "Cartão crédito" },
    { value: "boleto", label: "Boleto" },
    { value: "transferencia", label: "Transferência" },
    { value: "convenio", label: "Convênio" },
  ];
  const TIPOS_FORMA_EDITAVEL = new Set<MovTipo>(["recebimento", "despesa", "estorno"]);
  const [salvandoFormaId, setSalvandoFormaId] = useState<string | null>(null);

  // Diálogo de detalhes do cartão (crédito/débito) na edição inline da Forma.
  type CartaoDetalhes = {
    bandeira: string;
    parcelas: string;
    data: string;
    autorizacao: string;
    valorLiquido: string;
  };
  const [cartaoEditFor, setCartaoEditFor] = useState<{
    mov: Mov;
    forma: "cartao_credito" | "cartao_debito";
  } | null>(null);
  const [cartaoEdit, setCartaoEdit] = useState<CartaoDetalhes>({
    bandeira: "",
    parcelas: "1",
    data: "",
    autorizacao: "",
    valorLiquido: "",
  });
  const [salvandoCartao, setSalvandoCartao] = useState(false);

  async function alterarFormaMov(m: Mov, nova: string) {
    if (!m || !nova || nova === (m.forma_pagamento ?? "")) return;
    // Cartão exige coleta de dados adicionais → abre o diálogo em vez de gravar direto.
    if (nova === "cartao_credito" || nova === "cartao_debito") {
      // Pré-carrega valores existentes do lançamento (se houver) para permitir edição.
      let prefill: Partial<CartaoDetalhes> = {};
      if (m.lancamento_id) {
        const { data } = await supabase
          .from("fin_lancamentos")
          .select(
            "bandeira_cartao, parcelas, data_cartao, autorizacao_cartao, valor_liquido_cartao, valor",
          )
          .eq("id", m.lancamento_id)
          .maybeSingle();
        const row = (data ?? null) as {
          bandeira_cartao: string | null;
          parcelas: number | null;
          data_cartao: string | null;
          autorizacao_cartao: string | null;
          valor_liquido_cartao: number | null;
          valor: number | null;
        } | null;
        if (row) {
          prefill = {
            bandeira: row.bandeira_cartao ?? "",
            parcelas: String(row.parcelas ?? 1),
            data: row.data_cartao ?? "",
            autorizacao: row.autorizacao_cartao ?? "",
            valorLiquido:
              row.valor_liquido_cartao != null
                ? String(row.valor_liquido_cartao)
                : String(row.valor ?? m.valor ?? ""),
          };
        }
      }
      setCartaoEdit({
        bandeira: prefill.bandeira ?? "",
        parcelas: prefill.parcelas ?? "1",
        data: prefill.data ?? new Date().toISOString().slice(0, 10),
        autorizacao: prefill.autorizacao ?? "",
        valorLiquido: prefill.valorLiquido ?? String(m.valor ?? ""),
      });
      setCartaoEditFor({ mov: m, forma: nova });
      return;
    }
    setSalvandoFormaId(m.id);
    try {
      const { error: eMov } = await supabase
        .from("caixa_movimentos")
        .update({ forma_pagamento: nova })
        .eq("id", m.id);
      if (eMov) throw eMov;
      if (m.lancamento_id) {
        const { error: eLanc } = await supabase
          .from("fin_lancamentos")
          .update({ forma_pagamento: nova })
          .eq("id", m.lancamento_id);
        if (eLanc) throw eLanc;
      }
      const patchLista = (lista: Mov[]) =>
        lista.map((x) => (x.id === m.id ? { ...x, forma_pagamento: nova } : x));
      setMinhasMovs((prev) => patchLista(prev));
      setMinhasMovsHist((prev) => patchLista(prev));
      setTodosMovs((prev) => patchLista(prev));
      setDetalheMovs((prev) => patchLista(prev));
      toast.success("Forma de pagamento atualizada.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar";
      toast.error(msg);
    } finally {
      setSalvandoFormaId(null);
    }
  }

  async function confirmarCartaoEdit() {
    if (!cartaoEditFor) return;
    const { mov: m, forma: nova } = cartaoEditFor;
    if (!cartaoEdit.bandeira) {
      toast.error("Selecione a bandeira do cartão.");
      return;
    }
    const parcelasNum =
      nova === "cartao_credito" ? Math.max(1, Number(cartaoEdit.parcelas) || 1) : 1;
    const liquidoNum = cartaoEdit.valorLiquido
      ? Number(String(cartaoEdit.valorLiquido).replace(",", "."))
      : null;
    setSalvandoCartao(true);
    try {
      const { error: eMov } = await supabase
        .from("caixa_movimentos")
        .update({ forma_pagamento: nova })
        .eq("id", m.id);
      if (eMov) throw eMov;
      if (m.lancamento_id) {
        const patchLanc: Record<string, unknown> = {
          forma_pagamento: nova,
          bandeira_cartao: cartaoEdit.bandeira,
          parcelas: parcelasNum,
          data_cartao: cartaoEdit.data || null,
          autorizacao_cartao: cartaoEdit.autorizacao || null,
          valor_liquido_cartao: liquidoNum,
        };
        const { error: eLanc } = await supabase
          .from("fin_lancamentos")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(patchLanc as any)
          .eq("id", m.lancamento_id);
        if (eLanc) throw eLanc;
      }
      const patchLista = (lista: Mov[]) =>
        lista.map((x) => (x.id === m.id ? { ...x, forma_pagamento: nova } : x));
      setMinhasMovs((prev) => patchLista(prev));
      setMinhasMovsHist((prev) => patchLista(prev));
      setTodosMovs((prev) => patchLista(prev));
      setDetalheMovs((prev) => patchLista(prev));
      toast.success("Forma de pagamento atualizada.");
      setCartaoEditFor(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar";
      toast.error(msg);
    } finally {
      setSalvandoCartao(false);
    }
  }

  function FormaCellEditavel({ m }: { m: Mov }) {
    const bucket = normalizarForma(m.forma_pagamento);
    const editavel = podeEscrever && bucket !== "misto" && TIPOS_FORMA_EDITAVEL.has(m.tipo);
    if (!editavel) {
      return <span className="text-xs">{formatarFormaPagamento(m, mistoObs)}</span>;
    }
    const atual = (m.forma_pagamento ?? "").trim();
    const known = FORMAS_EDITAVEIS.some((f) => f.value === atual);
    return (
      <Select
        value={known ? atual : ""}
        onValueChange={(v) => {
          void alterarFormaMov(m, v);
        }}
        disabled={salvandoFormaId === m.id}
      >
        <SelectTrigger className="h-7 text-xs w-[150px]">
          <SelectValue placeholder={atual || "Selecione"} />
        </SelectTrigger>
        <SelectContent>
          {FORMAS_EDITAVEIS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
          {atual && !known && <SelectItem value={atual}>{atual}</SelectItem>}
        </SelectContent>
      </Select>
    );
  }

  // Formularios
  const [valorAbertura, setValorAbertura] = useState("0");
  const [obsAbertura, setObsAbertura] = useState("");
  const [movValor, setMovValor] = useState("");
  const [movDesc, setMovDesc] = useState("");
  const [movDescTouched, setMovDescTouched] = useState(false);
  const [movForma, setMovForma] = useState("dinheiro");
  const [movBandeira, setMovBandeira] = useState("");
  const [movParcelas, setMovParcelas] = useState("1");
  const [movDestinoUserId, setMovDestinoUserId] = useState("");
  const [membrosClinica, setMembrosClinica] = useState<Array<{ user_id: string; nome: string }>>(
    [],
  );
  const [obsFechamento, setObsFechamento] = useState("");
  const [dataFechamento, setDataFechamento] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  // Conferência por forma de pagamento no fechamento do próprio caixa.
  const [conferidoOwn, setConferidoOwn] = useState<Record<string, string>>({});

  // Fechamento de caixa de OUTRO usuário (gestor/admin no tab "Todos").
  const [openFecharTerceiro, setOpenFecharTerceiro] = useState<Sessao | null>(null);
  const [informadoTerceiro, setInformadoTerceiro] = useState("");
  const [obsTerceiro, setObsTerceiro] = useState("");
  const [dataFechamentoTerceiro, setDataFechamentoTerceiro] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  // Conferência por forma de pagamento no fechamento de terceiros.
  const [conferidoTerceiro, setConferidoTerceiro] = useState<Record<string, string>>({});
  // Fechamento em lote (por dia) — gestor
  const [openLote, setOpenLote] = useState(false);
  // Desfazer fechamento (admin/gestor/financeiro)
  const [openReabrir, setOpenReabrir] = useState<Sessao | null>(null);
  const [motivoReabrir, setMotivoReabrir] = useState("");
  const [loteSelecionados, setLoteSelecionados] = useState<Record<string, boolean>>({});
  const [obsLote, setObsLote] = useState("");

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
        .order("aberto_em", { ascending: false }),
      supabase
        .from("caixa_sessoes")
        .select(SESSAO_FIELDS)
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("user_id", user.id)
        .order("aberto_em", { ascending: false })
        .limit(5),
    ]);
    // A sessão exibida é a escolhida pelo operador (quando ele trocou para um
    // caixa pendente de outro dia) ou, no caso normal, a mais recente.
    const abertas = (abertaRes.data ?? []) as Sessao[];
    setSessoesAbertas(abertas);
    const aberta =
      (sessaoAtivaId ? abertas.find((s) => s.id === sessaoAtivaId) : null) ?? abertas[0] ?? null;
    setMinhaSessao(aberta);

    // Enriquecimento compartilhado entre os dois ramos (com/sem sessão
    // aberta). Puxa serviço, médico E paciente a partir de
    // fin_lancamentos, para que a lista de Movimentos exiba o paciente
    // vinculado mesmo quando a descrição do movimento não trouxer o nome.
    const enrichMovsList = async (
      movsList: Mov[],
    ): Promise<{
      enrich: Map<string, MovEnrich>;
      anulados: Set<string>;
    }> => {
      const enrich = new Map<string, MovEnrich>();
      const anulados = new Set<string>();
      const lancIds = Array.from(
        new Set(movsList.map((m) => m.lancamento_id).filter((x): x is string => !!x)),
      );
      if (lancIds.length === 0) return { enrich, anulados };
      const lancRows: LancamentoEnrichRow[] = [];
      for (const ids of chunkArray(lancIds, 200)) {
        const { data, error } = await supabase
          .from("fin_lancamentos")
          .select("id, medico_id, agendamento_id, paciente_id, descricao, status, criado_por")
          .in("id", ids);
        if (error) {
          console.warn("Falha ao enriquecer movimentos do caixa por lançamento", error);
          continue;
        }
        lancRows.push(...((data ?? []) as LancamentoEnrichRow[]));
      }
      // Quais desses lançamentos já tiveram a devolução gravada no caixa.
      // A consulta vai ao banco em vez de olhar só os movimentos carregados
      // na tela: quando o caixa do recebimento já estava fechado, o estorno é
      // lançado no caixa aberto do dia, que pode estar fora do período
      // filtrado. Ver `lancsAnulados`.
      const comDevolucao = new Set<string>();
      for (const ids of chunkArray(lancIds, 200)) {
        const { data, error } = await supabase
          .from("caixa_movimentos")
          .select("lancamento_id, tipo, descricao")
          .in("lancamento_id", ids)
          .in("tipo", ["estorno", "sangria"]);
        if (error) {
          console.warn("Falha ao verificar devoluções dos lançamentos do caixa", error);
          continue;
        }
        for (const r of (data ?? []) as Array<{
          lancamento_id: string | null;
          tipo: string;
          descricao: string | null;
        }>) {
          if (!r.lancamento_id) continue;
          const ehDevolucao =
            r.tipo === "estorno" ||
            (r.tipo === "sangria" && (r.descricao ?? "").toLowerCase().startsWith("estorno"));
          if (ehDevolucao) comDevolucao.add(r.lancamento_id);
        }
      }
      for (const l of lancRows) {
        if (l.status === "cancelado" && comDevolucao.has(l.id)) anulados.add(l.id);
      }
      const medIds = new Set(lancRows.map((l) => l.medico_id).filter((x): x is string => !!x));
      const agIds = Array.from(
        new Set(lancRows.map((l) => l.agendamento_id).filter((x): x is string => !!x)),
      );
      const pacIds = new Set(lancRows.map((l) => l.paciente_id).filter((x): x is string => !!x));

      const agChunks = chunkArray(agIds, 200);
      const agResults = await Promise.all(
        agChunks.map((ids) =>
          supabase
            .from("agendamentos")
            .select(
              "id, procedimento, paciente_id, medico_id, ficha_numero, inicio, agenda_id, paciente_nome",
            )
            .in("id", ids),
        ),
      );
      const agRows: AgendamentoEnrichRow[] = [];
      for (const r of agResults) {
        if (r.error) {
          console.warn("Falha ao enriquecer movimentos do caixa por agendamento", r.error);
          continue;
        }
        agRows.push(...((r.data ?? []) as AgendamentoEnrichRow[]));
      }

      const agMap = new Map<string, AgendamentoEnrichRow>();
      for (const a of agRows) {
        agMap.set(a.id, a);
        if (a.medico_id) medIds.add(a.medico_id);
        // Paciente pelo agendamento cobre casos em que fin_lancamentos
        // não tem paciente_id (ex.: mensalidades ou lançamentos gerados
        // por caminhos antigos).
        if (a.paciente_id) pacIds.add(a.paciente_id);
      }

      const medChunks = chunkArray(Array.from(medIds), 200);
      const pacChunks = chunkArray(Array.from(pacIds), 200);
      const [medResults, pacResults] = await Promise.all([
        Promise.all(
          medChunks.map((ids) => supabase.from("medicos").select("id, nome").in("id", ids)),
        ),
        Promise.all(
          pacChunks.map((ids) => supabase.from("pacientes").select("id, nome").in("id", ids)),
        ),
      ]);
      const medMap = new Map<string, string>();
      for (const r of medResults) {
        if (r.error) {
          console.warn("Falha ao enriquecer movimentos do caixa por médico", r.error);
          continue;
        }
        for (const m of (r.data ?? []) as Array<{ id: string; nome: string | null }>) {
          if (m.nome) medMap.set(m.id, m.nome);
        }
      }
      const pacMap = new Map<string, string>();
      for (const r of pacResults) {
        if (r.error) {
          console.warn("Falha ao enriquecer movimentos do caixa por paciente", r.error);
          continue;
        }
        for (const p of (r.data ?? []) as Array<{ id: string; nome: string | null }>) {
          if (p.nome) pacMap.set(p.id, p.nome);
        }
      }

      const fichaCalculadaPorAg = new Map<string, number>();
      // Fichas calculadas: em vez de uma consulta por (dia, médico, agenda) —
      // que gerava dezenas de idas ao banco em série — buscamos os
      // agendamentos do dia inteiro UMA vez por dia (em paralelo) e
      // classificamos por (médico, agenda) no navegador. Mesma numeração
      // final, custo drasticamente menor.
      const diasFicha = new Set<string>();
      for (const a of agRows) {
        if (typeof a.ficha_numero === "number" && a.ficha_numero > 0) continue;
        const day = saoPauloDayKey(a.inicio);
        if (day) diasFicha.add(day);
      }
      if (diasFicha.size > 0) {
        // Teto de dias: agora que a lista pode cobrir meses inteiros, sem esta
        // trava um período largo dispararia uma consulta por dia (centenas de
        // idas ao banco de uma vez) só para numerar fichas antigas. Acima do
        // teto, os dias mais recentes são calculados e os mais antigos ficam
        // com a ficha gravada no próprio agendamento — a linha do movimento
        // continua aparecendo normalmente, que é o que importa aqui.
        const dias = Array.from(diasFicha)
          .sort((a, b) => b.localeCompare(a))
          .slice(0, LIMITE_DIAS_FICHA);
        const diaResults = await Promise.all(
          dias.map((day) => {
            const range = saoPauloDayRange(day);
            return supabase
              .from("agendamentos")
              .select("id, inicio, paciente_nome, medico_id, agenda_id")
              .eq("clinica_id", clinicaAtual.clinica_id)
              .gte("inicio", range.start)
              .lte("inicio", range.end)
              .range(0, 9999);
          }),
        );
        type FichaRow = {
          id: string;
          inicio: string | null;
          paciente_nome: string | null;
          medico_id: string | null;
          agenda_id: string | null;
        };
        for (const r of diaResults) {
          if (r.error) {
            console.warn("Falha ao calcular ficha no caixa", r.error);
            continue;
          }
          const rows = (r.data ?? []) as FichaRow[];
          const porGrupo = new Map<string, FichaRow[]>();
          for (const row of rows) {
            const key = `${row.medico_id ?? "__sem_profissional__"}::${row.agenda_id ?? "__sem_agenda__"}`;
            const arr = porGrupo.get(key) ?? [];
            arr.push(row);
            porGrupo.set(key, arr);
          }
          for (const arr of porGrupo.values()) {
            arr.sort((a, b) => {
              const t = String(a.inicio ?? "").localeCompare(String(b.inicio ?? ""));
              if (t !== 0) return t;
              return String(a.paciente_nome ?? "").localeCompare(
                String(b.paciente_nome ?? ""),
                "pt-BR",
                { sensitivity: "base" },
              );
            });
            arr.forEach((row, index) => fichaCalculadaPorAg.set(row.id, index + 1));
          }
        }
      }

      for (const l of lancRows) {
        const agInfo = l.agendamento_id ? agMap.get(l.agendamento_id) : undefined;
        const servicoFromProc = agInfo?.procedimento ?? null;
        // fallback: extrai serviço da descrição do lançamento
        let servico = servicoFromProc;
        if (!servico && l.descricao) {
          const desc = l.descricao;
          const idx = Math.max(desc.lastIndexOf(" — "), desc.lastIndexOf(" · "));
          if (idx > 0)
            servico =
              desc
                .slice(idx + 3)
                .replace(/\s*\(.*\)\s*$/, "")
                .trim() || null;
        }
        // Paciente: prioriza fin_lancamentos.paciente_id; fallback via
        // agendamento.paciente_id; se nada disso existir, fica null e a
        // linha usará pacienteFromDescricao() no render.
        const pacIdEfetivo = l.paciente_id ?? agInfo?.paciente_id ?? null;
        const pacienteNome = pacIdEfetivo ? (pacMap.get(pacIdEfetivo) ?? null) : null;
        const medIdEfetivo = l.medico_id ?? agInfo?.medico_id ?? null;
        enrich.set(l.id, {
          servico,
          medico: medIdEfetivo ? (medMap.get(medIdEfetivo) ?? null) : null,
          paciente: pacienteNome,
          paciente_id: pacIdEfetivo,
          ficha: agInfo
            ? (agInfo.ficha_numero ?? fichaCalculadaPorAg.get(agInfo.id) ?? null)
            : null,
          faturado_por_id: l.criado_por ?? null,
        });
      }
      return { enrich, anulados };
    };

    // Sessões recentes do usuário (aberta + últimas fechadas).
    // Carregamos os movimentos de TODAS elas em uma única consulta e
    // dividimos em duas listas:
    //   - minhasMovs      → só a sessão aberta atual (base para Saldo/Totais)
    //   - minhasMovsHist  → todas as sessões recentes (base para a aba
    //                       "Meu caixa → Movimentos", permitindo ver e
    //                       solicitar estorno de lançamentos retroativos)
    // A lista "Meus movimentos" passa a ser buscada pelo PERÍODO escolhido no
    // filtro da aba, e não pelas 5 sessões de caixa mais recentes.
    //
    // Era isto que sumia com movimento antigo: o filtro de período só
    // recortava o que já estava na memória, e o que estava na memória vinha
    // das 5 últimas sessões. Um recebimento de abril não aparecia nem
    // escolhendo "Todos", porque nunca chegava a ser buscado no banco.
    //
    // Duas consultas, de propósito:
    //   - período  → alimenta SÓ a lista de movimentos;
    //   - sessão aberta → entra sempre, seja qual for o período, porque o
    //     Saldo e os totais do "Meu caixa" saem dela e não podem mudar por
    //     causa de um filtro de listagem.
    let queryPeriodo = supabase
      .from("caixa_movimentos")
      .select(MOV_FIELDS_COM_SESSAO)
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("caixa_sessoes.user_id", user.id)
      .order("created_at", { ascending: false })
      .range(0, LIMITE_MOVS - 1);
    if (janelaIniISO && janelaFimISO) {
      queryPeriodo = queryPeriodo.gte("created_at", janelaIniISO).lte("created_at", janelaFimISO);
    }
    const [movsPeriodoRes, movsAbertaRes] = await Promise.all([
      queryPeriodo,
      aberta
        ? supabase
            .from("caixa_movimentos")
            .select(MOV_FIELDS)
            .eq("sessao_id", (aberta as Sessao).id)
            .order("created_at", { ascending: false })
            .range(0, LIMITE_MOVS - 1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (movsPeriodoRes.error) {
      console.warn("[caixa] falha ao buscar movimentos do período", movsPeriodoRes.error);
    }
    const porIdMov = new Map<string, Mov>();
    for (const m of (movsPeriodoRes.data ?? []) as unknown as Mov[]) porIdMov.set(m.id, m);
    for (const m of (movsAbertaRes.data ?? []) as unknown as Mov[]) porIdMov.set(m.id, m);
    const movsHist: Mov[] = Array.from(porIdMov.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    setMinhasMovsHist(movsHist);
    setMovsNoTeto(((movsPeriodoRes.data ?? []) as unknown as Mov[]).length >= LIMITE_MOVS);
    if (aberta) {
      // Sessão aberta: `minhasMovs` recebe apenas os movimentos da sessão
      // atual (ordem crescente, como antes) para manter Saldo/Totais
      // idênticos ao comportamento anterior.
      const sid = (aberta as Sessao).id;
      const abertaMovs = movsHist
        .filter((m) => m.sessao_id === sid)
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      // Escopo estrito da sessão: o "Meu caixa" agrega SOMENTE movimentos
      // gravados em caixa_movimentos com sessao_id = sessão aberta.
      // Despesas gerais/contas a pagar do módulo Financeiro (inclusive de
      // meses anteriores) NÃO entram aqui — elas pertencem ao financeiro da
      // clínica, não ao caixa da recepção. Saldo = Abertura + Entradas − Saídas
      // da própria sessão.
      setMinhasMovs(abertaMovs);
    } else {
      setMinhasMovs([]);
    }
    const { enrich, anulados } = await enrichMovsList(movsHist);
    setEnrichPorLanc(enrich);
    setLancsAnulados(anulados);

    setMinhasSessoes((histRes.data ?? []) as Sessao[]);
    setLoading(false);
  }, [clinicaAtual, user, janelaIniISO, janelaFimISO, sessaoAtivaId]);

  // Recarrega o conjunto de solicitações de estorno pendentes vinculadas
  // às movimentações atuais para trocar o botão pelo rótulo
  // "Aguardando aprovação" quando o financeiro ainda não decidiu.
  const reloadEstornosPendentes = useCallback(async () => {
    if (!clinicaAtual) {
      setEstornosPorLanc(new Map());
      setEstornosPorMov(new Map());
      return;
    }
    const ids = Array.from(
      new Set(minhasMovs.map((m) => m.lancamento_id).filter((x): x is string => !!x)),
    );
    const sangriaIds = Array.from(
      new Set(minhasMovs.filter((m) => m.tipo === "sangria").map((m) => m.id)),
    );
    if (ids.length === 0 && sangriaIds.length === 0) {
      setEstornosPorLanc(new Map());
      setEstornosPorMov(new Map());
      return;
    }
    let q = supabase
      .from("estorno_solicitacoes")
      .select("lancamento_id, caixa_movimento_id, status")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .in("status", ["pendente", "aprovado"]);
    // OR entre os dois filtros de id (lancamento OU caixa_movimento).
    const parts: string[] = [];
    if (ids.length > 0) parts.push(`lancamento_id.in.(${ids.join(",")})`);
    if (sangriaIds.length > 0) parts.push(`caixa_movimento_id.in.(${sangriaIds.join(",")})`);
    q = q.or(parts.join(","));
    const { data } = await q;
    const mapLanc = new Map<string, "pendente" | "aprovado">();
    const mapMov = new Map<string, "pendente" | "aprovado">();
    for (const r of (data ?? []) as Array<{
      lancamento_id: string | null;
      caixa_movimento_id: string | null;
      status: string;
    }>) {
      const st = r.status === "pendente" || r.status === "aprovado" ? r.status : null;
      if (!st) continue;
      if (r.lancamento_id) {
        const prev = mapLanc.get(r.lancamento_id);
        if (prev !== "pendente") mapLanc.set(r.lancamento_id, st);
      }
      if (r.caixa_movimento_id) {
        const prev = mapMov.get(r.caixa_movimento_id);
        if (prev !== "pendente") mapMov.set(r.caixa_movimento_id, st);
      }
    }
    setEstornosPorLanc(mapLanc);
    setEstornosPorMov(mapMov);
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
        () => {
          void reloadEstornosPendentes();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [clinicaAtual, reloadEstornosPendentes]);

  // Se o usuário voltar para a aba após o financeiro decidir e o evento
  // realtime tiver sido perdido, ressincroniza ao ganhar foco.
  useEffect(() => {
    const onFocus = () => {
      void reloadEstornosPendentes();
    };
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
    // Dia de Brasília, não o dia de Greenwich. Com toISOString() a data virava
    // a do dia seguinte a partir das 21h, e a fila de cobrança esvaziava no
    // meio do expediente da noite: passava a pedir os agendamentos de amanhã.
    const hoje = hojeBR();
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
        procedimento: r.procedimento,
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

  /**
   * Abre a cobrança de um paciente da fila recalculando o preço pelo motor de
   * convênio da Agenda (`precoAtendimentoParaCaixa`).
   *
   * A fila vem da função `fila_caixa_hoje` do banco, que faz uma conta
   * aproximada e divergia da Agenda: ignorava dependentes do contrato e
   * benefícios com cota, repetia o preço de dinheiro na coluna de cartão e não
   * checava mensalidade em atraso. O valor cobrado passa a sair do mesmo motor
   * que a Agenda usa. Se o recálculo falhar, o valor da fila é mantido — a
   * cobrança nunca fica travada por causa disso.
   */
  const abrirCobranca = useCallback(
    async (f: FilaCaixa) => {
      setOpenCobranca(f);
      setCobrancaLinhas([
        { forma: "dinheiro", valor: String(f.valor || 0), bandeira: "", parcelas: "1" },
      ]);
      setPrecoCobranca(null);
      if (!clinicaAtual || !f.paciente_id) return;
      precoPedidoRef.current = f.id;
      setCalculandoPreco(true);
      try {
        // O nome do serviço vem do próprio agendamento, e não do texto montado
        // para a lista: a fila anexa ao nome a etiqueta do benefício
        // ("CONSULTA (-10%)"), que não casa com o cadastro de serviços.
        const { data: ag } = await supabase
          .from("agendamentos")
          .select("medico_id,procedimento,inicio")
          .eq("id", f.id)
          .maybeSingle();
        const linha = ag as {
          medico_id: string | null;
          procedimento: string | null;
          inicio: string | null;
        } | null;
        const preco = await precoAtendimentoParaCaixa({
          clinicaId: clinicaAtual.clinica_id,
          pacienteId: f.paciente_id,
          medicoId: linha?.medico_id ?? null,
          procedimentoNome: linha?.procedimento ?? f.procedimento,
          agendamentoId: f.id,
          dataRef: linha?.inicio ?? f.inicio,
        });
        if (precoPedidoRef.current !== f.id) return;
        if (!preco) return;
        setPrecoCobranca(preco);
        setOpenCobranca((prev) =>
          prev && prev.id === f.id
            ? { ...prev, valor: preco.valorDinheiro, valor_cartao: preco.valorCartao }
            : prev,
        );
        setCobrancaLinhas((prev) =>
          prev.length === 1 && prev[0].forma === "dinheiro"
            ? [{ ...prev[0], valor: String(preco.valorDinheiro) }]
            : prev,
        );
      } catch (err) {
        console.error("[caixa] falha ao recalcular preço do convênio", err);
      } finally {
        if (precoPedidoRef.current === f.id) setCalculandoPreco(false);
      }
    },
    [clinicaAtual],
  );

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
    void abrirCobranca(item);
  }, [minhaSessao, filaCaixa, abrirCobranca]);

  // Mesma proteção da tela nova do caixa (caixa-shell): `fila_caixa_hoje` é
  // uma função pesada e era recalculada a cada evento de `agendamentos`, em
  // todos os caixas abertos ao mesmo tempo. Reagimos só a fichas do dia e
  // agrupamos a rajada num único recálculo.
  useEffect(() => {
    if (!clinicaAtual || !minhaSessao) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const ehDeHoje = (linha: { inicio?: string | null } | null | undefined) => {
      if (!linha?.inicio) return true; // sem a data, não dá para descartar
      const hoje = new Date().toLocaleDateString("en-CA");
      return new Date(linha.inicio).toLocaleDateString("en-CA") === hoje;
    };
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
        (payload: {
          new?: { inicio?: string | null } | null;
          old?: { inicio?: string | null } | null;
        }) => {
          if (!ehDeHoje(payload?.new) && !ehDeHoje(payload?.old)) return;
          if (t) clearTimeout(t);
          t = setTimeout(() => void loadFilaCaixa(), 800);
        },
      )
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      void supabase.removeChannel(ch);
    };
  }, [clinicaAtual, minhaSessao, loadFilaCaixa]);

  // Executa cobrança: insere movimento caixa + lançamento financeiro + avança fluxo
  const cobrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual || !user || !minhaSessao || !openCobranca) return;
    // Ver `modoConferencia`: cobrar um paciente com o caixa de ontem na tela
    // jogaria o recebimento de hoje no dia errado.
    if (modoConferencia) {
      toast.error(
        "Você está vendo o caixa de um dia anterior. Volte ao caixa de hoje para cobrar.",
      );
      return;
    }
    // Valida cada linha
    const linhasValidadas: Array<{
      forma: string;
      valor: number;
      bandeira: string;
      parcelas: string;
      pagoEm: string;
      recibo: string;
    }> = [];
    const hojeIso = new Date().toLocaleDateString("en-CA");
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
      // Pago adiantado na Clínica Total: sem a data ou o número do recibo
      // antigo não sobra nada ligando a guia liberada agora ao dinheiro que
      // entrou lá atrás — e este valor, de propósito, não aparece em nenhum
      // movimento de caixa para ser conferido depois.
      if (l.forma === FORMA_PAGO_SISTEMA_ANTERIOR) {
        const pagoEm = (l.pagoEm ?? "").trim();
        const recibo = (l.recibo ?? "").trim();
        if (!pagoEm && !recibo) {
          toast.error(
            "Informe a data em que o paciente pagou no sistema anterior ou o número do recibo antigo.",
            { duration: 8000 },
          );
          return;
        }
        if (pagoEm && (!/^\d{4}-\d{2}-\d{2}$/.test(pagoEm) || pagoEm > hojeIso)) {
          toast.error("Data do pagamento no sistema anterior inválida ou no futuro.");
          return;
        }
      }
      linhasValidadas.push({
        forma: l.forma,
        valor: v,
        bandeira: l.bandeira,
        parcelas: l.parcelas,
        pagoEm: (l.pagoEm ?? "").trim(),
        recibo: (l.recibo ?? "").trim(),
      });
    }
    if (linhasValidadas.length === 0) {
      toast.error("Adicione ao menos uma forma de pagamento");
      return;
    }
    setSaving(true);
    // Escopo externo ao try para permitir rollback inter-linhas no catch.
    // Cada par (lançamento + movimento) é atômico via RPC no banco
    // (Abordagem B). Estas listas apenas rastreiam pares JÁ confirmados
    // pelo banco para desfazê-los caso uma linha POSTERIOR falhe.
    const movimentosInseridos: string[] = [];
    const lancamentosInseridos: string[] = [];
    try {
      // Re-checa server-side se já foi pago (anti dupla cobrança / race).
      // ALTA-10: sem o filtro de status, uma cobrança já estornada
      // (status='cancelado') ainda contava como "já paga" e bloqueava
      // cobrar de novo — mesmo depois de um estorno legítimo.
      const { data: jaPago } = await supabase
        .from("fin_lancamentos")
        .select("id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .eq("status", "confirmado")
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
      // Carimbo do convênio na descrição, no mesmo formato da Agenda. Serve à
      // contagem de cota do benefício: um atendimento gravado como "particular"
      // só conta como uso do convênio quando o lançamento registra que o
      // desconto foi aplicado. Sem o carimbo, um benefício limitado (ex.: uma
      // consulta a R$ 9,99 por mês) poderia ser usado de novo no mesmo período.
      // Só carimba quando o valor cobrado ficou dentro do preço do convênio —
      // se o atendente digitou o valor cheio, a cobrança é particular e não
      // consome a cota.
      const totalCobrado = linhasValidadas.reduce((acc, l) => acc + l.valor, 0);
      const tetoConvenio = precoCobranca
        ? Math.max(precoCobranca.valorDinheiro, precoCobranca.valorCartao) + 0.01
        : 0;
      const sufixoConvenio =
        precoCobranca &&
        !precoCobranca.cobrandoParticular &&
        precoCobranca.convenioNome &&
        precoCobranca.rotuloBeneficio &&
        totalCobrado <= tetoConvenio
          ? ` — Convênio ${precoCobranca.convenioNome} (${precoCobranca.rotuloBeneficio})`
          : "";
      // Cada linha vira um par atômico (lançamento + movimento) via RPC.
      // Se a inserção do movimento falhar dentro do banco, o lançamento
      // é revertido automaticamente pela transação Postgres — não há mais
      // janela para lançamento órfão sem movimento correspondente.
      for (const l of linhasValidadas) {
        const sufixoCartao = montarSufixoCartao(l.forma, l.bandeira, l.parcelas);
        // Pago adiantado no sistema anterior: o lançamento existe e confirma a
        // quitação (a guia sai, o repasse é apurado), mas NÃO nasce movimento
        // de caixa. O dinheiro entrou na Clínica Total, antes da virada, e não
        // está na gaveta de hoje — somá-lo criaria uma sobra que a recepção
        // nunca conseguiria conferir contra o cupom impresso.
        const ehPagoAnterior = l.forma === FORMA_PAGO_SISTEMA_ANTERIOR;
        const obsPagoAnterior = ehPagoAnterior
          ? [
              "PAGO NO SISTEMA ANTERIOR (Clínica Total) — atendimento quitado antes da virada de sistema",
              l.pagoEm ? `Pago em ${l.pagoEm.split("-").reverse().join("/")}` : "",
              l.recibo ? `Recibo anterior nº ${l.recibo}` : "",
              "Não entra no caixa de hoje: o dinheiro foi recebido no sistema anterior. Repasse do prestador calculado normalmente.",
            ]
              .filter(Boolean)
              .join(" — ")
          : null;
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "fn_registrar_lancamento_e_caixa",
          {
            p_lancamento: {
              clinica_id: clinicaAtual.clinica_id,
              tipo: "receita",
              descricao: `Recebimento — ${openCobranca.paciente_nome} (${openCobranca.procedimento ?? "atendimento"})${sufixoCartao}${sufixoConvenio}`,
              valor: l.valor,
              data: hoje,
              status: "confirmado",
              forma_pagamento: l.forma,
              observacoes: obsPagoAnterior,
              paciente_id: openCobranca.paciente_id,
              agendamento_id: openCobranca.id,
              medico_id: medicoId,
              criado_por: user.id,
            },
            p_movimento: ehPagoAnterior
              ? null
              : {
                  user_id: user.id,
                  tipo: "recebimento",
                  valor: l.valor,
                  descricao: `${openCobranca.paciente_nome} · ${openCobranca.procedimento ?? "atendimento"}${sufixoCartao}${sufixoConvenio}`,
                  forma_pagamento: l.forma,
                },
          },
        );
        if (rpcErr) throw rpcErr;
        const ids = (rpcData ?? {}) as { lancamento_id?: string; movimento_id?: string };
        if (ids.lancamento_id) lancamentosInseridos.push(ids.lancamento_id);
        if (ids.movimento_id) movimentosInseridos.push(ids.movimento_id);
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
      // Rollback dos inserts já feitos neste ciclo para evitar orfãos
      // (caixa sem lançamento ou lançamento sem caixa).
      try {
        if (lancamentosInseridos.length > 0) {
          await supabase.from("fin_lancamentos").delete().in("id", lancamentosInseridos);
        }
        if (movimentosInseridos.length > 0) {
          await supabase.from("caixa_movimentos").delete().in("id", movimentosInseridos);
        }
      } catch (rbErr) {
        console.error("Falha no rollback da cobrança:", rbErr);
        toast.error(
          `ERRO CRÍTICO: cobrança falhou e o rollback também. Registros parciais podem ter permanecido — contate o suporte. Mov: [${movimentosInseridos.join(",")}] Lanc: [${lancamentosInseridos.join(",")}]`,
        );
      }
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
  // Sincronia em tempo real: qualquer despesa/receita lançada no Financeiro
  // (ou movimento de caixa de outro operador) atualiza na hora o resumo do dia,
  // as Saídas e o saldo atual.
  useRealtimeRefresh(["fin_lancamentos", "caixa_movimentos"], load);
  useEffect(() => {
    if (tab === "todos") void loadTodos();
  }, [tab, loadTodos]);

  // Membros da clínica para o seletor de destino de sangria/suprimento
  useEffect(() => {
    if (!clinicaAtual) {
      setMembrosClinica([]);
      return;
    }
    let alive = true;
    void (async () => {
      const { data: memb } = await supabase
        .from("clinica_memberships")
        .select("user_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true);
      const ids = ((memb ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
      if (!ids.length) {
        if (alive) setMembrosClinica([]);
        return;
      }
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
      const list = ((profs ?? []) as Array<{ id: string; nome: string | null }>)
        .map((p) => ({ user_id: p.id, nome: p.nome || "(sem nome)" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      if (alive) setMembrosClinica(list);
    })();
    return () => {
      alive = false;
    };
  }, [clinicaAtual?.clinica_id]);

  // Calculos

  /**
   * Movimento que faz parte de um par recebimento + devolução já anulado.
   *
   * Some do saldo, do resumo por tipo e das Entradas, porque as duas pernas se
   * cancelam e mantê-las só inflaria os totais: uma taxa de adesão cobrada e
   * depois devolvida apareceria como entrada de dinheiro que já não está no
   * caixa.
   *
   * Exige a devolução REGISTRADA — ver `lancsAnulados`. Cancelar o lançamento
   * no financeiro não abre a gaveta: enquanto não houver estorno lançado, a
   * cédula continua lá e o dinheiro tem que continuar contando, exatamente
   * como a grade de conferência do fechamento sempre contou. É essa exigência
   * que faz o card "Saldo atual" e o fechamento pararem de divergir.
   */
  const movEstornado = useCallback(
    (m: Mov) => {
      if (!m.lancamento_id || !lancsAnulados.has(m.lancamento_id)) return false;
      if (m.tipo === "recebimento" || m.tipo === "estorno") return true;
      if (m.tipo === "sangria" && (m.descricao ?? "").toLowerCase().startsWith("estorno")) {
        return true;
      }
      return false;
    },
    [lancsAnulados],
  );

  const saldoAtual = useMemo(() => {
    if (!minhaSessao) return 0;
    return saldoDeMovimentos(minhasMovs.filter((m) => !movEstornado(m)));
  }, [minhaSessao, minhasMovs, movEstornado]);

  const resumoTipos = useMemo(() => {
    const r: Record<MovTipo, number> = {
      abertura: 0,
      sangria: 0,
      suprimento: 0,
      recebimento: 0,
      despesa: 0,
      fechamento: 0,
      estorno: 0,
      reabertura: 0,
    };
    minhasMovs.forEach((m) => {
      if (movEstornado(m)) return;
      r[m.tipo] += Number(m.valor || 0);
    });
    return r;
  }, [minhasMovs, movEstornado]);

  // Decomposição de pagamentos "misto" — busca observações dos lançamentos
  // vinculados às movimentações da sessão atual. Chave = lancamento_id.
  const [mistoObs, setMistoObs] = useState<Record<string, string>>({});
  // Composição estruturada por lançamento (falha 2.8). `null` = legado/sem dado.
  const [mistoComp, setMistoComp] = useState<
    Record<string, Partial<Record<FormaBucket, number>> | null>
  >({});
  // Flag por clínica: quando ligada, a decomposição usa o dado estruturado e
  // o resíduo sem fonte confiável vai para "Indeterminado" em vez de Dinheiro.
  // Desligar a flag restaura o comportamento antigo (rollback sem deploy).
  const { enabled: mistoEstruturado } = useClinicFeatureFlag("caixa_misto_estruturado");
  const residualBucket: FormaBucket = mistoEstruturado ? "indeterminado" : "dinheiro";
  /** Partes decompostas de um movimento "misto": estruturado → observação. */
  const partesDoMov = useCallback(
    (m: { lancamento_id?: string | null }): Partial<Record<FormaBucket, number>> => {
      const id = m.lancamento_id ?? undefined;
      if (!id) return {};
      if (mistoEstruturado) {
        const est = mistoComp[id];
        if (est) return est;
      }
      return decomporMistoObs(mistoObs[id]);
    },
    [mistoComp, mistoObs, mistoEstruturado],
  );
  const mistoLancIds = useMemo(() => {
    const ids = new Set<string>();
    const scan = (arr: Mov[]) =>
      arr.forEach((m) => {
        if (
          m.tipo === "recebimento" &&
          normalizarForma(m.forma_pagamento) === "misto" &&
          m.lancamento_id
        ) {
          ids.add(m.lancamento_id);
        }
      });
    scan(minhasMovs);
    scan(detalheMovs);
    scan(todosMovs);
    return Array.from(ids);
  }, [minhasMovs, detalheMovs, todosMovs]);
  useEffect(() => {
    let alive = true;
    const pendentes = mistoLancIds.filter((id) => !(id in mistoObs));
    if (pendentes.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("fin_lancamentos")
        .select("id, observacoes, composicao_pagamento")
        .in("id", pendentes);
      if (!alive || !data) return;
      setMistoComp((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{ id: string; composicao_pagamento?: unknown }>) {
          next[row.id] = partesDaComposicao(row.composicao_pagamento);
        }
        for (const id of pendentes) if (!(id in next)) next[id] = null;
        return next;
      });
      setMistoObs((prev) => {
        const next = { ...prev };
        for (const row of data) next[row.id as string] = (row.observacoes as string | null) ?? "";
        // Marca também os que não voltaram, para não refazer o fetch em loop.
        for (const id of pendentes) if (!(id in next)) next[id] = "";
        return next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [mistoLancIds, mistoObs]);

  // Resolve nomes de usuários referenciados por movimentos e enriquecimentos
  // (operador do caixa + quem faturou o lançamento). Executa em lotes de 200
  // e cacheia no state para evitar refetch a cada re-render.
  useEffect(() => {
    const alvo = new Set<string>();
    const scanMovs = (arr: Mov[]) =>
      arr.forEach((m) => {
        if (m.user_id) alvo.add(m.user_id);
      });
    scanMovs(minhasMovs);
    scanMovs(minhasMovsHist);
    scanMovs(detalheMovs);
    scanMovs(todosMovs);
    enrichPorLanc.forEach((e) => {
      if (e.faturado_por_id) alvo.add(e.faturado_por_id);
    });
    const pendentes = Array.from(alvo).filter((id) => !userNamesById.has(id));
    if (pendentes.length === 0) return;
    let alive = true;
    (async () => {
      const acc = new Map<string, string>();
      for (const ids of chunkArray(pendentes, 200)) {
        const { data } = await supabase.from("profiles").select("id, nome").in("id", ids);
        for (const p of (data ?? []) as Array<{ id: string; nome: string | null }>) {
          acc.set(p.id, (p.nome ?? "").trim() || p.id.slice(0, 8));
        }
        // marca também os não retornados para não refazer o fetch em loop
        for (const id of ids) if (!acc.has(id)) acc.set(id, id.slice(0, 8));
      }
      if (!alive) return;
      setUserNamesById((prev) => {
        const next = new Map(prev);
        acc.forEach((v, k) => next.set(k, v));
        return next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [minhasMovs, minhasMovsHist, detalheMovs, todosMovs, enrichPorLanc, userNamesById]);

  /** Retorna o nome de quem faturou o movimento (prioriza
   *  fin_lancamentos.criado_por → autor real do lançamento; fallback para
   *  caixa_movimentos.user_id → operador do caixa que registrou o mov). */
  const usuarioNomeFor = useCallback(
    (m: Mov): string => {
      const enr = m.lancamento_id ? enrichPorLanc.get(m.lancamento_id) : undefined;
      const uid = enr?.faturado_por_id ?? m.user_id ?? null;
      if (!uid) return "—";
      return userNamesById.get(uid) ?? "…";
    },
    [enrichPorLanc, userNamesById],
  );

  // Entradas agrupadas por forma de pagamento (recebimento + suprimento).
  // Aliases cartao_credito/cartao_debito ficam em credito/debito; pagamentos
  // "misto" são decompostos pelas observações do fin_lancamento.
  const entradasPorForma = useMemo(() => {
    const r: Record<string, number> & { total: number } = {
      dinheiro: 0,
      pix: 0,
      debito: 0,
      credito: 0,
      boleto: 0,
      transferencia: 0,
      convenio: 0,
      outros: 0,
      indeterminado: 0,
      total: 0,
    };
    minhasMovs.forEach((m) => {
      if (m.tipo !== "recebimento" && m.tipo !== "suprimento") return;
      if (movEstornado(m)) return;
      const v = Number(m.valor || 0);
      r.total += v;
      const bucket = bucketDeMov(m);
      if (bucket === "misto") {
        const partes = partesDoMov(m);
        let somado = 0;
        for (const [k, val] of Object.entries(partes)) {
          r[k] = (r[k] ?? 0) + (val ?? 0);
          somado += val ?? 0;
        }
        // Diferença (ex.: obs ainda não carregada, ou parcela sem label
        // reconhecido) vai para "outros" para preservar o total.
        const resto = v - somado;
        if (Math.abs(resto) > 0.005) r[residualBucket] = (r[residualBucket] ?? 0) + resto;
      } else {
        r[bucket] += v;
      }
    });
    return r;
  }, [minhasMovs, partesDoMov, residualBucket, movEstornado]);

  // Quebra do "Saldo" por dia (com base em created_at das movimentações
  // da sessão atual). Cada dia mostra entradas, saídas, saldo do dia e
  // entradas agrupadas por forma de pagamento.
  interface DiaResumo {
    dia: string; // YYYY-MM-DD
    label: string; // dd/mm/yyyy
    entradas: number;
    saidas: number;
    saldo: number;
    porForma: Record<string, number>;
  }
  const resumoPorDia = useMemo<DiaResumo[]>(() => {
    const mapa = new Map<string, DiaResumo>();
    const bucketInit = (): Record<string, number> => ({
      dinheiro: 0,
      pix: 0,
      debito: 0,
      credito: 0,
      boleto: 0,
      transferencia: 0,
      convenio: 0,
      outros: 0,
      indeterminado: 0,
    });
    for (const m of minhasMovs) {
      if (movEstornado(m)) continue;
      const d = new Date(m.created_at);
      const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let r = mapa.get(dia);
      if (!r) {
        r = {
          dia,
          label: d.toLocaleDateString("pt-BR"),
          entradas: 0,
          saidas: 0,
          saldo: 0,
          porForma: bucketInit(),
        };
        mapa.set(dia, r);
      }
      const v = Number(m.valor || 0);
      r.saldo += (SINAL_NO_SALDO[m.tipo] ?? 0) * v;
      if (m.tipo === "recebimento" || m.tipo === "suprimento") {
        r.entradas += v;
        const bucket = bucketDeMov(m);
        if (bucket === "misto") {
          const partes = partesDoMov(m);
          let somado = 0;
          for (const [k, val] of Object.entries(partes)) {
            r.porForma[k] = (r.porForma[k] ?? 0) + (val ?? 0);
            somado += val ?? 0;
          }
          const resto = v - somado;
          if (Math.abs(resto) > 0.005)
            r.porForma[residualBucket] = (r.porForma[residualBucket] ?? 0) + resto;
        } else {
          r.porForma[bucket] = (r.porForma[bucket] ?? 0) + v;
        }
      } else if (m.tipo === "sangria" || m.tipo === "despesa" || m.tipo === "estorno") {
        r.saidas += v;
      }
    }
    return Array.from(mapa.values()).sort((a, b) => b.dia.localeCompare(a.dia));
  }, [minhasMovs, partesDoMov, residualBucket, movEstornado]);

  // Helper: converte `created_at` para "YYYY-MM-DD" no fuso local, o mesmo
  // formato em que o dia do fechamento é comparado.
  const localYMD = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /**
   * Caixas de dias ANTERIORES que ficaram abertos.
   *
   * O dia é comparado no fuso local (o mesmo do fechamento),
   * nunca em UTC: às 21h de Brasília o UTC já virou o dia seguinte e o caixa de
   * hoje apareceria como pendente.
   */
  const hojeYMD = localYMD(new Date().toISOString());
  const sessoesPendentes = useMemo(
    () => sessoesAbertas.filter((s) => localYMD(s.aberto_em) < hojeYMD),
    [sessoesAbertas, hojeYMD],
  );
  /** Dia (YYYY-MM-DD) da sessão que a tela está exibindo. */
  const diaSessaoAtiva = minhaSessao ? localYMD(minhaSessao.aberto_em) : null;
  /**
   * A tela está exibindo um caixa de dia anterior — modo conferência.
   *
   * Nesse modo o operador só pode CONFERIR e FECHAR. Lançar sangria,
   * suprimento, estorno, recebimento ou cobrança fica bloqueado: esses
   * lançamentos gravam com `sessao_id = minhaSessao.id` e cairiam num dia que
   * já acabou, recriando exatamente o tipo de bagunça que este recurso existe
   * para resolver. O dinheiro de hoje pertence ao caixa de hoje.
   */
  const modoConferencia = !!minhaSessao && !!diaSessaoAtiva && diaSessaoAtiva !== hojeYMD;
  /** Caixa de hoje, quando já existe — o destino do botão "voltar". */
  const sessaoDeHoje = useMemo(
    () => sessoesAbertas.find((s) => localYMD(s.aberto_em) === hojeYMD) ?? null,
    [sessoesAbertas, hojeYMD],
  );

  /**
   * Dias (YYYY-MM-DD) em que o caixa exibido tem movimento de dinheiro.
   *
   * Abertura, fechamento e reabertura ficam de fora: são marcos do próprio
   * caixa, não dinheiro. Um caixa aberto e não usado tem esta lista vazia e
   * continua podendo ser encerrado zerado.
   */
  const diasComMovimento = useMemo(() => {
    const dias = new Set<string>();
    for (const m of minhasMovs) {
      if (m.id.startsWith("fin:")) continue;
      if (m.tipo === "abertura" || m.tipo === "fechamento" || m.tipo === "reabertura") continue;
      dias.add(localYMD(m.created_at));
    }
    return Array.from(dias).sort();
  }, [minhasMovs]);

  /**
   * O caixa acumulou movimento em mais de um dia — então o fechamento cobre
   * TODOS eles de uma vez.
   *
   * Fechar só um dia encerra a sessão inteira do mesmo jeito, e o movimento
   * dos outros dias fica preso dentro de um caixa já fechado: fora do
   * fechamento, fora do cupom e invisível na tela. Foi assim que o caixa de
   * 19/08/2026 acabou fechado "no dia 18/08", com R$ 299,99 de movimento que
   * nunca entrou em fechamento nenhum e uma diferença de R$ 1.554,00 que não
   * existia.
   */
  const fechamentoCobreTudo = diasComMovimento.length > 1;

  /**
   * Ao trocar de caixa, o modal de fechamento passa a sugerir o dia daquele
   * caixa — senão a atendente abriria o fechamento do caixa de ontem com a
   * data de hoje selecionada e veria uma grade vazia.
   *
   * A preferência é pelo último dia COM MOVIMENTO: num caixa que ficou aberto
   * da véspera para hoje, o dia do dinheiro é o que importa, não o da abertura.
   */
  useEffect(() => {
    const dia = diasComMovimento[diasComMovimento.length - 1] ?? diaSessaoAtiva;
    if (dia) setDataFechamento(dia);
  }, [diasComMovimento, diaSessaoAtiva]);

  // Escopo por dia selecionado no modal de "Fechar caixa": movimentos,
  // saldo (entradas - saídas) e por-forma calculados apenas daquele dia.
  const movsDoDiaFechamento = useMemo(() => {
    // Despesas virtuais (vindas do Financeiro, sem movimento físico de caixa)
    // não entram na conferência de fechamento — o dinheiro em gaveta não foi
    // afetado por elas.
    const reais = minhasMovs.filter((m) => !m.id.startsWith("fin:"));
    // Caixa com movimento em mais de um dia fecha inteiro, sem recorte por
    // dia — ver `fechamentoCobreTudo`.
    if (fechamentoCobreTudo || !dataFechamento) return reais;
    return reais.filter((m) => localYMD(m.created_at) === dataFechamento);
  }, [minhasMovs, dataFechamento, fechamentoCobreTudo]);
  /**
   * Saldo do dia no escopo da conferência: exatamente os mesmos movimentos que
   * porFormaDoDiaFechamento distribui por forma de pagamento.
   *
   * A abertura fica FORA de propósito. O troco inicial não é uma forma de
   * pagamento — ele é conferido no quadro "Dinheiro na gaveta", que já o inclui
   * via saldoInicial em esperadoGaveta. Se entrasse aqui, o total das formas
   * nunca fecharia com o calculado num dia aberto com troco, e como o campo do
   * total deixou de ser editável ninguém poderia corrigir: o fechamento
   * gravaria diferença ≠ 0 e o caixa cairia em "Em conferência" sem motivo.
   * Medido na base: em 60 dias, 1 dia-operador tinha troco > 0 (11/08/2026,
   * R$ 110,00, que viraria uma falta fantasma de R$ 110,00).
   *
   * A regra de "quanto cada tipo pesa no saldo" mora em `SINAL_NO_SALDO`, onde
   * abertura, fechamento e reabertura valem zero — a mesma conta que o gestor
   * usa em `calcSaldoSessao`.
   */
  const saldoDoDiaFechamento = useMemo(
    () => saldoDeMovimentos(movsDoDiaFechamento),
    [movsDoDiaFechamento],
  );
  /**
   * Saldo líquido por forma de pagamento de um conjunto de movimentos.
   *
   * É a fonte única do "Esperado" de cada forma no fechamento. Existe como
   * função porque a pré-carga da grade de conferência já foi calculada em
   * paralelo, com outra regra: ela pulava sangria e despesa. Num dia com
   * sangria o campo Dinheiro nascia com o valor BRUTO recebido em vez do que
   * sobra na gaveta, e o modal abria acusando uma "Sobra em caixa" do tamanho
   * exato da sangria — em 19/08/2026 seriam R$ 7.983,97 no caixa da Mayara,
   * R$ 5.983,84 no da Suellen e R$ 4.900,00 no da Nicole. Quem fechava o dia
   * já selecionado pegava a pré-carga certa (esta regra) e quem trocava o
   * campo "Dia a fechar" pegava a errada: o caixa batia para uma operadora e
   * não batia para outra. Com uma regra só, a pré-carga não pode divergir do
   * esperado.
   */
  const detalhePorFormaDosMovs = useCallback(
    (movs: Mov[]): Record<string, EntradaSaida> => {
      const r: Record<string, EntradaSaida> = {};
      for (const k of CHAVES_FORMA) r[k] = { entradas: 0, saidas: 0 };
      const somar = (chave: string, valor: number, ehSaida: boolean) => {
        const alvo = (r[chave] ??= { entradas: 0, saidas: 0 });
        if (ehSaida) alvo.saidas += valor;
        else alvo.entradas += valor;
      };
      movs.forEach((m) => {
        // "Esperado por forma" deve refletir o SALDO LÍQUIDO por forma no dia,
        // batendo com o saldo do caixa (entradas − saídas). Por isso incluímos
        // também sangria e despesa, como saída. Abertura/fechamento não entram
        // (abertura é saldo inicial, fechamento é registro contábil).
        if (
          m.tipo !== "recebimento" &&
          m.tipo !== "suprimento" &&
          m.tipo !== "estorno" &&
          m.tipo !== "sangria" &&
          m.tipo !== "despesa"
        )
          return;
        const ehSaida = m.tipo === "estorno" || m.tipo === "sangria" || m.tipo === "despesa";
        const v = Number(m.valor || 0);
        const bucket = bucketDeMov(m);
        if (bucket === "misto") {
          const partes = partesDoMov(m);
          let somado = 0;
          for (const [k, val] of Object.entries(partes)) {
            somar(k, val ?? 0, ehSaida);
            somado += val ?? 0;
          }
          const resto = v - somado;
          // Sem decomposição (pagamento agrupado, obs sem "Pagamento misto:"),
          // o resto cai em Dinheiro — a UI não deve exibir "Outros" para
          // recebimentos reais. O operador pode ajustar no modal de fechamento.
          if (Math.abs(resto) > 0.005) somar(residualBucket, resto, ehSaida);
        } else {
          somar(bucket, v, ehSaida);
        }
      });
      return r;
    },
    [partesDoMov, residualBucket],
  );

  /**
   * Saldo líquido por forma (entradas − saídas). Derivado do detalhado de
   * propósito: enquanto existirem duas contas paralelas, o "Esperado" da grade
   * de conferência e o que sai impresso no comprovante podem divergir sem
   * ninguém perceber.
   */
  const porFormaDosMovs = useCallback(
    (movs: Mov[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const [k, d] of Object.entries(detalhePorFormaDosMovs(movs))) {
        out[k] = d.entradas - d.saidas;
      }
      return out;
    },
    [detalhePorFormaDosMovs],
  );

  const detalheDoDiaFechamento = useMemo<Record<string, EntradaSaida>>(
    () => detalhePorFormaDosMovs(movsDoDiaFechamento),
    [movsDoDiaFechamento, detalhePorFormaDosMovs],
  );
  const porFormaDoDiaFechamento = useMemo<Record<string, number>>(
    () => porFormaDosMovs(movsDoDiaFechamento),
    [movsDoDiaFechamento, porFormaDosMovs],
  );

  /**
   * Valores que a grade de conferência do fechamento assume por padrão: o
   * esperado de cada forma com saldo, e Dinheiro sempre presente (é o único
   * valor físico, tem que ser digitado mesmo quando o esperado é zero).
   */
  const conferenciaInicial = useCallback((porForma: Record<string, number>) => {
    const inicial: Record<string, string> = {};
    for (const [k, v] of Object.entries(porForma)) {
      if (Math.abs(v) > 0.005) inicial[k] = v.toFixed(2);
    }
    if (!inicial.dinheiro) inicial.dinheiro = "0.00";
    return inicial;
  }, []);

  /**
   * Saldo calculado de uma sessão inteira — é o "calculado" que o gestor vê e
   * grava ao fechar o caixa de outra pessoa, sozinho ou em lote.
   *
   * Usa a mesma conta de `saldoDoDiaFechamento`, via `saldoDeMovimentos`. Antes
   * eram duas contas paralelas e esta somava a abertura: o mesmo caixa fechava
   * com um valor pela mão da operadora e outro pela mão do gestor, e a
   * diferença era exatamente o troco.
   */
  const calcSaldoSessao = useCallback(
    (sid: string) => saldoDeMovimentos(todosMovs.filter((m) => m.sessao_id === sid)),
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

  // ============ Agrupamento por operador × dia ============
  // Um mesmo turno pode atravessar a meia-noite; a listagem mostra uma linha
  // por dia, com os movimentos, sangrias, informado e diferença daquele dia
  // específico. Cada dia = "um caixa" com abertura e fechamento próprios.
  type LinhaDia = {
    key: string;
    user_id: string;
    user_nome: string;
    data: string;
    primeiraAbertura: string | null;
    ultimoFechamento: string | null;
    statusDia: "aberto" | "fechado";
    valorAbertura: number;
    calculado: number;
    informado: number;
    sangria: number;
    estorno: number;
    diferenca: number;
    sessoes: Sessao[];
    sessaoAbertaId: string | null;
  };
  const localDate = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fmtDia = (data: string) => {
    const [y, m, d] = data.split("-");
    return `${d}/${m}/${y}`;
  };
  const fmtHora = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

  const agruparPorDia = useCallback((sessoes: Sessao[], movs: Mov[]): LinhaDia[] => {
    const buckets = new Map<string, LinhaDia>();
    const sessById = new Map(sessoes.map((s) => [s.id, s]));
    const get = (uid: string, nome: string, data: string) => {
      const k = `${uid}__${data}`;
      let b = buckets.get(k);
      if (!b) {
        b = {
          key: k,
          user_id: uid,
          user_nome: nome,
          data,
          primeiraAbertura: null,
          ultimoFechamento: null,
          statusDia: "fechado",
          valorAbertura: 0,
          calculado: 0,
          informado: 0,
          sangria: 0,
          estorno: 0,
          diferenca: 0,
          sessoes: [],
          sessaoAbertaId: null,
        };
        buckets.set(k, b);
      }
      return b;
    };
    for (const s of sessoes) {
      const nome = (s.user_nome || s.user_id.slice(0, 8)).toString();
      const dAb = localDate(s.aberto_em);
      if (dAb) {
        const b = get(s.user_id, nome, dAb);
        b.sessoes.push(s);
        b.valorAbertura += Number(s.valor_abertura || 0);
        if (!b.primeiraAbertura || s.aberto_em < b.primeiraAbertura)
          b.primeiraAbertura = s.aberto_em;
        if (s.status === "aberto") {
          b.statusDia = "aberto";
          if (!b.sessaoAbertaId) b.sessaoAbertaId = s.id;
        }
      }
      const dFe = localDate(s.fechado_em);
      if (dFe && s.fechado_em) {
        const b = get(s.user_id, nome, dFe);
        if (!b.sessoes.some((x) => x.id === s.id)) b.sessoes.push(s);
        b.informado += Number(s.valor_fechamento_informado || 0);
        b.diferenca += Number(s.diferenca || 0);
        if (!b.ultimoFechamento || s.fechado_em > b.ultimoFechamento)
          b.ultimoFechamento = s.fechado_em;
      }
    }
    for (const m of movs) {
      const d = localDate(m.created_at);
      if (!d) continue;
      const s = sessById.get(m.sessao_id);
      if (!s) continue;
      const nome = (s.user_nome || s.user_id.slice(0, 8)).toString();
      const b = get(s.user_id, nome, d);
      b.calculado += (SINAL_NO_SALDO[m.tipo] ?? 0) * Number(m.valor || 0);
      if (m.tipo === "sangria") b.sangria += Number(m.valor || 0);
      if ((m.descricao ?? "").toLowerCase().includes("estorno")) b.estorno += Number(m.valor || 0);
    }
    return Array.from(buckets.values()).sort((a, b) => {
      if (a.data !== b.data) return b.data.localeCompare(a.data);
      return a.user_nome.localeCompare(b.user_nome, "pt-BR");
    });
  }, []);

  const linhasTodosPorDia = useMemo(
    () => agruparPorDia(todasSessoes, todosMovs),
    [agruparPorDia, todasSessoes, todosMovs],
  );
  const linhasMinhasPorDia = useMemo(
    () => agruparPorDia(minhasSessoes, minhasMovs),
    [agruparPorDia, minhasSessoes, minhasMovs],
  );

  // Entradas e saídas por forma de pagamento em uma sessão qualquer (usa
  // `todosMovs`). Decompõe pagamentos "misto" quando as observações do
  // lançamento já foram carregadas via `mistoObs`. Mesma regra de
  // `detalhePorFormaDosMovs`, só que recortada por sessão.
  const detalhePorFormaSessao = useCallback(
    (sid: string) => detalhePorFormaDosMovs(todosMovs.filter((m) => m.sessao_id === sid)),
    [todosMovs, detalhePorFormaDosMovs],
  );

  /** Saldo líquido por forma na sessão: entradas − saídas, para bater com o
   *  saldo do caixa. Usado no modal de fechamento feito pelo gestor. */
  const entradasPorFormaSessao = useCallback(
    (sid: string) => {
      const out: Record<string, number> = {};
      for (const [k, d] of Object.entries(detalhePorFormaSessao(sid))) {
        out[k] = d.entradas - d.saidas;
      }
      return out;
    },
    [detalhePorFormaSessao],
  );

  // ===== Resumo do turno atual (cartões por forma + gaveta física) =====
  // Base: movimentos reais da minha sessão (exclui despesas virtuais do
  // Financeiro, que não passam pela gaveta).
  const movsSessaoAtual = useMemo(
    () => minhasMovs.filter((m) => !m.id.startsWith("fin:")),
    [minhasMovs],
  );
  /** Saldo líquido por forma de pagamento no turno atual. */
  const porFormaSessaoAtual = useMemo<Record<string, number>>(() => {
    const r: Record<string, number> = {
      dinheiro: 0,
      pix: 0,
      debito: 0,
      credito: 0,
      boleto: 0,
      transferencia: 0,
      convenio: 0,
      outros: 0,
      indeterminado: 0,
    };
    movsSessaoAtual.forEach((m) => {
      if (m.tipo !== "recebimento" && m.tipo !== "estorno") return;
      const sinal = m.tipo === "estorno" ? -1 : 1;
      const v = Number(m.valor || 0) * sinal;
      const bucket = bucketDeMov(m);
      if (bucket === "misto") {
        const partes = partesDoMov(m);
        let somado = 0;
        for (const [k, val] of Object.entries(partes)) {
          r[k] = (r[k] ?? 0) + (val ?? 0) * sinal;
          somado += (val ?? 0) * sinal;
        }
        const resto = v - somado;
        if (Math.abs(resto) > 0.005) r[residualBucket] = (r[residualBucket] ?? 0) + resto;
      } else {
        r[bucket] = (r[bucket] ?? 0) + v;
      }
    });
    return r;
  }, [movsSessaoAtual, partesDoMov, residualBucket]);

  /** Composição do dinheiro físico da gaveta no turno atual. */
  const gavetaSessaoAtual = useMemo(() => {
    let suprimentos = 0;
    let sangrias = 0;
    let despesas = 0;
    movsSessaoAtual.forEach((m) => {
      const v = Number(m.valor || 0);
      if (m.tipo === "suprimento") suprimentos += v;
      else if (m.tipo === "sangria") sangrias += v;
      else if (m.tipo === "despesa" && bucketDeMov(m) === "dinheiro") despesas += v;
    });
    return {
      saldoInicial: Number(minhaSessao?.valor_abertura || 0),
      recebimentosDinheiro: Number(porFormaSessaoAtual.dinheiro || 0),
      suprimentos,
      sangrias,
      despesas,
    };
  }, [movsSessaoAtual, minhaSessao, porFormaSessaoAtual]);

  const esperadoGaveta = useMemo(() => saldoEsperadoGaveta(gavetaSessaoAtual), [gavetaSessaoAtual]);

  /**
   * Composição da gaveta do DIA que está sendo fechado — a mesma janela de
   * `detalheDoDiaFechamento`, não a do turno inteiro.
   *
   * `gavetaSessaoAtual` serve à tela (limite de sangria, quadro do turno) e
   * cobre sempre o turno inteiro. No comprovante isso imprimiria a conta de um
   * dia e a tabela por forma de outro. O troco só entra quando o dia fechado é
   * o dia em que a sessão foi aberta — ou quando o fechamento cobre todos os
   * dias do caixa; em qualquer outro caso ele não estava nesta gaveta.
   */
  const gavetaDoDiaFechamento = useMemo(() => {
    // Só recebimento e estorno: sangria e despesa aparecem em linha própria da
    // conta, e somá-las aqui as descontaria duas vezes.
    const dinheiro = detalhePorFormaDosMovs(
      movsDoDiaFechamento.filter((m) => m.tipo === "recebimento" || m.tipo === "estorno"),
    ).dinheiro ?? { entradas: 0, saidas: 0 };
    let suprimentos = 0;
    let sangrias = 0;
    let despesas = 0;
    movsDoDiaFechamento.forEach((m) => {
      const v = Number(m.valor || 0);
      if (m.tipo === "suprimento") suprimentos += v;
      else if (m.tipo === "sangria") sangrias += v;
      else if (m.tipo === "despesa" && bucketDeMov(m) === "dinheiro") despesas += v;
    });
    // Quando o caixa fecha todos os seus dias de uma vez (`fechamentoCobreTudo`),
    // o troco da abertura está na gaveta que está sendo conferida agora, mesmo
    // que ela tenha sido aberta num dia anterior.
    const abriuNoDiaFechado =
      fechamentoCobreTudo ||
      (!!minhaSessao?.aberto_em && localYMD(minhaSessao.aberto_em) === dataFechamento);
    return {
      saldoInicial: abriuNoDiaFechado ? Number(minhaSessao?.valor_abertura || 0) : 0,
      recebimentosDinheiro: dinheiro.entradas - dinheiro.saidas,
      suprimentos,
      sangrias,
      despesas,
    };
  }, [
    movsDoDiaFechamento,
    detalhePorFormaDosMovs,
    minhaSessao,
    dataFechamento,
    fechamentoCobreTudo,
  ]);

  const esperadoGavetaFechamento = useMemo(
    () => saldoEsperadoGaveta(gavetaDoDiaFechamento),
    [gavetaDoDiaFechamento],
  );

  /** Mesma conta para o caixa de outra pessoa, fechado pelo gestor. */
  const composicaoGavetaSessao = useCallback(
    (sid: string, valorAbertura: number) => {
      const movs = todosMovs.filter((m) => m.sessao_id === sid && !m.id.startsWith("fin:"));
      const dinheiro = detalhePorFormaDosMovs(
        movs.filter((m) => m.tipo === "recebimento" || m.tipo === "estorno"),
      ).dinheiro ?? { entradas: 0, saidas: 0 };
      let suprimentos = 0;
      let sangrias = 0;
      let despesas = 0;
      movs.forEach((m) => {
        const v = Number(m.valor || 0);
        if (m.tipo === "suprimento") suprimentos += v;
        else if (m.tipo === "sangria") sangrias += v;
        else if (m.tipo === "despesa" && bucketDeMov(m) === "dinheiro") despesas += v;
      });
      return {
        saldoInicial: Number(valorAbertura || 0),
        recebimentosDinheiro: dinheiro.entradas - dinheiro.saidas,
        suprimentos,
        sangrias,
        despesas,
      };
    },
    [todosMovs, detalhePorFormaDosMovs],
  );

  /**
   * Total conferido no fechamento do próprio caixa: soma de TODAS as formas
   * de pagamento informadas na grade de conferência (dinheiro, PIX, cartões,
   * boleto, transferência, convênio...).
   *
   * É derivado de `conferidoOwn` de propósito. Antes existia um estado
   * paralelo (`valorInformado`) que era pré-preenchido apenas com o esperado
   * em espécie; num dia com sangrias a gaveta fica em zero e o total do dia
   * aparecia como R$ 0,00, acusando "Falta em caixa" do valor inteiro do dia
   * e travando o fechamento. Mantendo uma única fonte de verdade, o total
   * não pode mais divergir das partes.
   */
  const totalConferidoOwn = useMemo(() => totalConferido(conferidoOwn), [conferidoOwn]);

  /**
   * Formas de pagamento com saldo negativo no dia que está sendo fechado.
   *
   * Nenhuma forma pode fechar negativa: significaria que saiu mais dinheiro
   * daquela forma do que entrou. Na prática isso só acontece no Dinheiro, e
   * sempre pelo mesmo motivo — sangria maior que a gaveta.
   *
   * O fechamento antigo não olhava para isso: somava todas as formas num total
   * só, o buraco no dinheiro era coberto por cartão/PIX (que nem passam pela
   * gaveta) e o caixa saía carimbado como "confere". Por isso a trava compara
   * forma a forma, tanto no CALCULADO (o que o sistema apurou) quanto no
   * CONFERIDO (o que a pessoa digitou) — ninguém conta dinheiro negativo.
   */
  const formasNegativasFechamento = useMemo(() => {
    const out: Array<{ chave: string; calculado: number; conferido: number }> = [];
    const chaves = new Set([...Object.keys(porFormaDoDiaFechamento), ...Object.keys(conferidoOwn)]);
    for (const k of chaves) {
      const calculado = Number(porFormaDoDiaFechamento[k] ?? 0);
      const conferido = Number(conferidoOwn[k]) || 0;
      if (calculado < -0.005 || conferido < -0.005) out.push({ chave: k, calculado, conferido });
    }
    return out.sort((a, b) => a.calculado - b.calculado);
  }, [porFormaDoDiaFechamento, conferidoOwn]);

  /**
   * Mesma trava, no fechamento feito pelo gestor sobre o caixa de outra pessoa.
   * Sem isto o bloqueio seria contornável só trocando de tela.
   */
  const formasNegativasTerceiro = useMemo(() => {
    if (!openFecharTerceiro) return [];
    const porForma = entradasPorFormaSessao(openFecharTerceiro.id);
    const out: Array<{ chave: string; calculado: number; conferido: number }> = [];
    const chaves = new Set([...Object.keys(porForma), ...Object.keys(conferidoTerceiro)]);
    for (const k of chaves) {
      const calculado = Number(porForma[k] ?? 0);
      const conferido = Number(conferidoTerceiro[k]) || 0;
      if (calculado < -0.005 || conferido < -0.005) out.push({ chave: k, calculado, conferido });
    }
    return out.sort((a, b) => a.calculado - b.calculado);
  }, [openFecharTerceiro, entradasPorFormaSessao, conferidoTerceiro]);

  /** Linha do tempo de sangrias e suprimentos do turno atual. */
  const movsGaveta = useMemo(
    () =>
      movsSessaoAtual
        .filter((m) => m.tipo === "sangria" || m.tipo === "suprimento")
        .map((m) => ({
          id: m.id,
          tipo: m.tipo as "sangria" | "suprimento",
          valor: Number(m.valor || 0),
          descricao: m.descricao ?? null,
          created_at: m.created_at,
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [movsSessaoAtual],
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
    // Ver `modoConferencia`: caixa de dia anterior só pode ser conferido e
    // fechado, nunca movimentado.
    if (modoConferencia) {
      toast.error(
        "Você está vendo o caixa de um dia anterior. Volte ao caixa de hoje para lançar.",
      );
      return;
    }
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
      toast.error(
        openMov.tipo === "sangria"
          ? "Selecione a quem o dinheiro está sendo entregue"
          : "Selecione de quem o dinheiro está sendo recebido",
      );
      return;
    }
    // Trava física da gaveta: sangria retira dinheiro em espécie, então nunca
    // pode ser maior do que o dinheiro que existe no turno (abertura +
    // recebimentos em dinheiro + suprimentos − sangrias − despesas em espécie).
    //
    // Sem esta trava a gaveta ficava negativa e o fechamento ainda dizia
    // "confere", porque o total do dia soma cartão/PIX (que nunca passam pela
    // gaveta) e o buraco no dinheiro era compensado por eles. Medido na base:
    // em 30 dias, 13 fechamentos terminaram com a gaveta negativa marcando
    // diferença R$ 0,00 — o maior deles, 18/08/2026, com −R$ 447,05.
    if (openMov.tipo === "sangria" && v > esperadoGaveta + 0.005) {
      toast.error(
        `Sangria maior que o dinheiro em caixa. Disponível agora: ${fmt(Math.max(0, esperadoGaveta))}.`,
      );
      return;
    }
    // A descrição é o registro do motivo/referência do lançamento manual e é
    // obrigatória em todos os tipos (mínimo de 3 caracteres).
    if (movDesc.trim().length < 3) {
      setMovDescTouched(true);
      toast.error(
        openMov.tipo === "estorno"
          ? "Descreva o motivo/paciente do estorno"
          : "Descrição é obrigatória (mínimo 3 caracteres)",
      );
      return;
    }
    const destinoNome = ehTransfer
      ? (membrosClinica.find((m) => m.user_id === movDestinoUserId)?.nome ?? null)
      : null;
    const sufixoDestino =
      ehTransfer && destinoNome
        ? ` — ${openMov.tipo === "sangria" ? "Entregue a" : "Recebido de"}: ${destinoNome}`
        : "";
    const sufixoCartao = ehPagto ? montarSufixoCartao(movForma, movBandeira, movParcelas) : "";
    setSaving(true);
    const { data: movRow, error } = await supabase
      .from("caixa_movimentos")
      .insert({
        sessao_id: minhaSessao.id,
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        tipo: openMov.tipo,
        valor: v,
        descricao: (movDesc || "") + sufixoCartao + sufixoDestino || null,
        forma_pagamento: ehPagto ? movForma : null,
        destino_user_id: ehTransfer ? movDestinoUserId : null,
        destino_nome: ehTransfer ? destinoNome : null,
      })
      .select("id")
      .single();
    if (error || !movRow) {
      setSaving(false);
      mostrarErro(error);
      return;
    }
    // Recebimento/despesa manuais são receita/despesa real (diferente de
    // sangria/suprimento, que só transferem dinheiro dentro do caixa) — sem um
    // fin_lancamentos vinculado, o valor nunca aparecia em Financeiro >
    // Movimento (que só importa sangria/suprimento de caixa_movimentos).
    if (openMov.tipo === "recebimento" || openMov.tipo === "despesa") {
      const { data: lanc, error: eLanc } = await supabase
        .from("fin_lancamentos")
        .insert({
          clinica_id: clinicaAtual.clinica_id,
          tipo: openMov.tipo === "recebimento" ? "receita" : "despesa",
          valor: v,
          descricao: `[Caixa] ${(movDesc || TIPO_LABEL[openMov.tipo]) + sufixoCartao}`,
          forma_pagamento: movForma,
          status: "confirmado",
          criado_por: user.id,
        })
        .select("id")
        .single();
      if (eLanc) {
        toast.warning(
          "Movimento de caixa registrado, mas falhou ao vincular ao financeiro — registre manualmente em Financeiro > Movimento.",
        );
      } else if (lanc) {
        await supabase
          .from("caixa_movimentos")
          .update({ lancamento_id: lanc.id })
          .eq("id", movRow.id);
      }
    }
    setSaving(false);
    setOpenMov(null);
    setMovDescTouched(false);
    const tipoLancado = openMov.tipo;
    const descLancada = (movDesc || "") + sufixoCartao + sufixoDestino;
    setMovValor("");
    setMovDesc("");
    setMovForma("dinheiro");
    setMovBandeira("");
    setMovParcelas("1");
    setMovDestinoUserId("");
    toast.success(`${TIPO_LABEL[tipoLancado]} registrada`);
    if (tipoLancado === "sangria" || tipoLancado === "suprimento" || tipoLancado === "estorno") {
      printComprovanteCaixa({
        tipo: tipoLancado,
        clinicaNome: clinicaAtual.clinica?.nome ?? "Clínica",
        operadorNome:
          minhaSessao.user_nome || user.user_metadata?.nome || user.email || "Atendente",
        valor: v,
        descricao: descLancada || null,
        destinoNome,
      });
    }
    void load();
  };

  const fecharCaixa = async (e: FormEvent) => {
    e.preventDefault();
    if (!minhaSessao || !clinicaAtual || !user) return;
    // Trava: forma de pagamento negativa não pode virar fechamento "confere".
    // Ver formasNegativasFechamento — o caixa precisa ser corrigido antes.
    if (formasNegativasFechamento.length > 0) {
      const lista = formasNegativasFechamento
        .map((f) => FORMA_LABEL[f.chave as FormaBucket] ?? f.chave)
        .join(", ");
      toast.error(
        `Não é possível fechar: ${lista} com saldo negativo. Corrija o lançamento errado antes de encerrar o caixa.`,
      );
      return;
    }
    // Trava: o dia a fechar tem de ser um dia com movimento deste caixa.
    // O campo do dia já é fixo na tela; esta é a segunda barreira, para o caso
    // de o estado ficar defasado (o operador abre o modal, o caixa recebe um
    // lançamento e a lista de dias muda embaixo dele). Sem ela, o fechamento
    // grava calculado R$ 0,00 e joga o conferido inteiro na diferença.
    if (diasComMovimento.length > 0 && !diasComMovimento.includes(dataFechamento)) {
      toast.error(
        `Este caixa não tem movimento no dia ${dataFechamento ? new Date(`${dataFechamento}T00:00:00`).toLocaleDateString("pt-BR") : "escolhido"}. Feche a tela e abra o fechamento de novo.`,
      );
      return;
    }
    const informado = totalConferidoOwn;
    // Escopo do fechamento: o dia do caixa, ou todos os dias dele quando ficou
    // aberto de um dia para o outro (ver `fechamentoCobreTudo`).
    const saldoRef = saldoDoDiaFechamento;
    const diff = informado - saldoRef;
    const rotuloDias = fechamentoCobreTudo
      ? `dos dias ${diasComMovimento.join(" + ")}`
      : `do dia ${dataFechamento}`;
    const rotuloObs = fechamentoCobreTudo
      ? `Dias ${diasComMovimento.join(" + ")}`
      : `Dia ${dataFechamento}`;
    // Data escolhida pelo operador — usa 23:59:59 local desse dia para preservar o dia contábil.
    const hoje = new Date().toISOString().slice(0, 10);
    const fechadoEmISO =
      dataFechamento && dataFechamento !== hoje
        ? new Date(`${dataFechamento}T23:59:59`).toISOString()
        : new Date().toISOString();
    setSaving(true);
    const { error } = await supabase
      .from("caixa_sessoes")
      .update({
        status: "fechado",
        fechado_em: fechadoEmISO,
        valor_fechamento_informado: informado,
        valor_fechamento_calculado: saldoRef,
        diferenca: diff,
        observacoes: obsFechamento
          ? `${minhaSessao.observacoes ? minhaSessao.observacoes + " | " : ""}[${rotuloObs}] ${obsFechamento}`
          : `${minhaSessao.observacoes ? minhaSessao.observacoes + " | " : ""}[${rotuloObs}]`,
      })
      .eq("id", minhaSessao.id);
    if (!error) {
      await supabase.from("caixa_movimentos").insert({
        sessao_id: minhaSessao.id,
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        tipo: "fechamento",
        valor: informado,
        created_at: fechadoEmISO,
        descricao: `Fechamento ${rotuloDias}. Calculado: ${fmt(saldoRef)} | Informado: ${fmt(informado)} | Diferença: ${fmt(diff)}`,
      });
    }
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setOpenFechar(false);
    const obsFinal = obsFechamento;
    setObsFechamento("");
    setConferidoOwn({});
    // Fechou um caixa pendente de outro dia: a tela volta sozinha para o caixa
    // de hoje, senão ficaria presa numa sessão que não existe mais como aberta.
    setSessaoAtivaId(null);
    setDataFechamento(new Date().toISOString().slice(0, 10));
    toast.success("Caixa fechado");
    // Comprovante escopado ao dia selecionado.
    // Entradas e saídas de cada forma no dia. Nada é removido aqui: quem
    // decide o que aparece é o comprovante, que mantém Dinheiro, PIX, Débito e
    // Crédito sempre visíveis. A limpeza que existia antes ("remove buckets
    // zerados para não poluir") era o que apagava a linha do Dinheiro nos dias
    // em que a operadora sangrava toda a gaveta e o líquido dava R$ 0,00.
    const porForma: Record<string, number> = { ...porFormaDoDiaFechamento };
    const porFormaDetalhe = detalheDoDiaFechamento;
    printComprovanteCaixa({
      tipo: "fechamento",
      clinicaNome: clinicaAtual.clinica?.nome ?? "Clínica",
      operadorNome: minhaSessao.user_nome || user.user_metadata?.nome || user.email || "Atendente",
      valor: informado,
      saldoCalculado: saldoRef,
      valorInformado: informado,
      diferenca: diff,
      descricao: `Fechamento ${rotuloDias}${obsFinal ? " — " + obsFinal : ""}`,
      porForma,
      porFormaDetalhe,
      formato: formatoFechamento,
      aberturaEm: minhaSessao.aberto_em,
      fechamentoEm: fechadoEmISO,
      // Conta da gaveta escopada ao dia fechado, para não divergir da tabela
      // por forma impressa logo abaixo dela.
      saldoInicial: gavetaDoDiaFechamento.saldoInicial,
      esperadoGaveta: esperadoGavetaFechamento,
      composicaoGaveta: gavetaDoDiaFechamento,
      movimentos: movsGaveta.map((m) => ({
        tipo: m.tipo,
        valor: m.valor,
        descricao: m.descricao,
        created_at: m.created_at,
      })),
    });
    void load();
  };

  // Fechamento pelo gestor de um caixa aberto por outro usuário.
  const fecharSessaoTerceiro = async (e: FormEvent) => {
    e.preventDefault();
    const alvo = openFecharTerceiro;
    if (!alvo || !clinicaAtual || !user) return;
    if (formasNegativasTerceiro.length > 0) {
      const lista = formasNegativasTerceiro
        .map((f) => FORMA_LABEL[f.chave as FormaBucket] ?? f.chave)
        .join(", ");
      toast.error(
        `Não é possível fechar: ${lista} com saldo negativo neste caixa. Corrija o lançamento errado antes de encerrar.`,
      );
      return;
    }
    const calc = calcSaldoSessao(alvo.id);
    const conferidoNum: Record<string, number> = {};
    for (const [k, v] of Object.entries(conferidoTerceiro)) {
      const n = Number(v) || 0;
      if (Math.abs(n) > 0.005) conferidoNum[k] = n;
    }
    const informado =
      Object.values(conferidoNum).reduce((a, x) => a + x, 0) || Number(informadoTerceiro) || 0;
    const diff = informado - calc;
    const breakdownStr = Object.entries(conferidoNum)
      .map(([k, v]) => `${FORMA_LABEL[k as FormaBucket] ?? k}: ${fmt(v)}`)
      .join("; ");
    const hoje = new Date().toISOString().slice(0, 10);
    const fechadoEmISO =
      dataFechamentoTerceiro && dataFechamentoTerceiro !== hoje
        ? new Date(`${dataFechamentoTerceiro}T23:59:59`).toISOString()
        : new Date().toISOString();
    setSaving(true);
    const { error } = await supabase
      .from("caixa_sessoes")
      .update({
        status: "fechado",
        fechado_em: fechadoEmISO,
        valor_fechamento_informado: informado,
        valor_fechamento_calculado: calc,
        diferenca: diff,
        observacoes: obsTerceiro
          ? `${alvo.observacoes ? alvo.observacoes + " | " : ""}[Fechado por ${user.user_metadata?.nome || user.email || "gestor"}] ${obsTerceiro}${breakdownStr ? " | Conferência: " + breakdownStr : ""}`
          : `${alvo.observacoes ? alvo.observacoes + " | " : ""}[Fechado por ${user.user_metadata?.nome || user.email || "gestor"}]${breakdownStr ? " | Conferência: " + breakdownStr : ""}`,
      })
      .eq("id", alvo.id);
    if (!error) {
      await supabase.from("caixa_movimentos").insert({
        sessao_id: alvo.id,
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        tipo: "fechamento",
        valor: informado,
        created_at: fechadoEmISO,
        descricao: `Fechamento pelo gestor. Operador original: ${alvo.user_nome || alvo.user_id.slice(0, 8)} | Calculado: ${fmt(calc)} | Informado: ${fmt(informado)} | Diferença: ${fmt(diff)}${breakdownStr ? " | " + breakdownStr : ""}`,
      });
    }
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setOpenFecharTerceiro(null);
    setInformadoTerceiro("");
    setObsTerceiro("");
    setConferidoTerceiro({});
    setDataFechamentoTerceiro(new Date().toISOString().slice(0, 10));
    toast.success(`Caixa de ${alvo.user_nome || "operador"} fechado`);
    printComprovanteCaixa({
      tipo: "fechamento",
      clinicaNome: clinicaAtual.clinica?.nome ?? "Clínica",
      operadorNome: alvo.user_nome || "Atendente",
      valor: informado,
      saldoCalculado: calc,
      valorInformado: informado,
      diferenca: diff,
      descricao: obsTerceiro ? `Fechado pelo gestor. ${obsTerceiro}` : "Fechado pelo gestor.",
      porForma: conferidoNum,
      // O que o sistema apurou na sessão, entrada a entrada — mesmo desenho do
      // comprovante do próprio operador. O que o gestor conferiu continua
      // registrado nas observações da sessão (`breakdownStr`).
      porFormaDetalhe: detalhePorFormaSessao(alvo.id),
      aberturaEm: alvo.aberto_em,
      fechamentoEm: fechadoEmISO,
      composicaoGaveta: composicaoGavetaSessao(alvo.id, Number(alvo.valor_abertura || 0)),
    });
    void loadTodos();
    void load();
  };

  // Desfazer fechamento de um caixa (admin/gestor/financeiro).
  // Registra auditoria via caixa_movimentos.tipo='reabertura' e limpa
  // os campos de fechamento da sessão, deixando-a novamente 'aberto'.
  const desfazerFechamento = async () => {
    const alvo = openReabrir;
    if (!alvo || !clinicaAtual || !user) return;
    const motivo = motivoReabrir.trim();
    if (!motivo) {
      toast.error("Informe o motivo da reabertura.");
      return;
    }
    const executorNome = user.user_metadata?.nome || user.email || "gestor";
    const agora = new Date();
    const marcador = `[Reaberto por ${executorNome} em ${agora.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} — ${motivo}]`;
    const novaObs = alvo.observacoes ? `${alvo.observacoes} | ${marcador}` : marcador;
    setSaving(true);
    const { error } = await supabase
      .from("caixa_sessoes")
      .update({
        status: "aberto",
        fechado_em: null,
        valor_fechamento_informado: null,
        valor_fechamento_calculado: null,
        diferenca: null,
        observacoes: novaObs,
      })
      .eq("id", alvo.id);
    if (!error) {
      // Remove o(s) movimento(s) de fechamento desta sessão para que o caixa
      // do operador volte exatamente ao estado anterior (saldo, lista de
      // movimentos e totais). A auditoria da reabertura fica registrada no
      // campo `observacoes` da sessão (marcador com executor, data e motivo).
      await supabase
        .from("caixa_movimentos")
        .delete()
        .eq("sessao_id", alvo.id)
        .eq("tipo", "fechamento");
    }
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setOpenReabrir(null);
    setMotivoReabrir("");
    toast.success("Fechamento desfeito. O caixa foi reaberto.");
    void loadTodos();
    void load();
  };

  // Fecha em lote todas as sessões marcadas — usa o saldo calculado como
  // valor informado (diferença = 0). Uma observação global identifica o
  // fechamento como feito pelo gestor.
  const fecharLote = async () => {
    if (!clinicaAtual || !user) return;
    const alvos = todasSessoes.filter((s) => s.status === "aberto" && loteSelecionados[s.id]);
    if (alvos.length === 0) {
      toast.error("Selecione ao menos um caixa aberto para fechar.");
      return;
    }
    setSaving(true);
    let ok = 0;
    let fail = 0;
    const gestorNome = user.user_metadata?.nome || user.email || "gestor";
    for (const alvo of alvos) {
      const calc = calcSaldoSessao(alvo.id);
      const { error } = await supabase
        .from("caixa_sessoes")
        .update({
          status: "fechado",
          fechado_em: new Date().toISOString(),
          valor_fechamento_informado: calc,
          valor_fechamento_calculado: calc,
          diferenca: 0,
          observacoes: `${alvo.observacoes ? alvo.observacoes + " | " : ""}[Fechado em lote por ${gestorNome}]${obsLote ? " " + obsLote : ""}`,
        })
        .eq("id", alvo.id);
      if (error) {
        fail += 1;
        continue;
      }
      await supabase.from("caixa_movimentos").insert({
        sessao_id: alvo.id,
        clinica_id: clinicaAtual.clinica_id,
        user_id: user.id,
        tipo: "fechamento",
        valor: calc,
        descricao: `Fechamento em lote pelo gestor. Operador original: ${alvo.user_nome || alvo.user_id.slice(0, 8)} | Calculado: ${fmt(calc)}${obsLote ? " | " + obsLote : ""}`,
      });
      ok += 1;
    }
    setSaving(false);
    setOpenLote(false);
    setLoteSelecionados({});
    setObsLote("");
    if (ok > 0) toast.success(`${ok} caixa(s) fechado(s)${fail ? ` — ${fail} falha(s)` : ""}`);
    else if (fail > 0) toast.error(`Falha ao fechar ${fail} caixa(s)`);
    void loadTodos();
    void load();
  };

  const verDetalhe = async (s: Sessao) => {
    // (marcador para localizar próxima função)
    setOpenDetalhe(s);
    const { data } = await supabase
      .from("caixa_movimentos")
      .select(MOV_FIELDS)
      .eq("sessao_id", s.id)
      .order("created_at", { ascending: true });
    setDetalheMovs((data ?? []) as Mov[]);
  };

  const imprimirRelatorioMovs = (movs: Mov[], periodo: string, subtitulo?: string) => {
    const esc = (v: unknown) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    type Cat = { label: string; pagamento: number; recebimento: number };
    const cats = new Map<string, Cat>();
    let totPag = 0,
      totReceb = 0;
    for (const m of movs) {
      if (m.tipo === "abertura" || m.tipo === "fechamento" || m.tipo === "reabertura") continue;
      const key = TIPO_LABEL[m.tipo];
      const cat = cats.get(key) ?? { label: key, pagamento: 0, recebimento: 0 };
      const v = Number(m.valor || 0);
      if (TIPO_SINAL[m.tipo] < 0) {
        cat.pagamento += v;
        totPag += v;
      } else if (TIPO_SINAL[m.tipo] > 0) {
        cat.recebimento += v;
        totReceb += v;
      }
      cats.set(key, cat);
    }
    let acc = 0;
    const linhasCat = Array.from(cats.values())
      .map((c) => {
        acc += c.recebimento - c.pagamento;
        return (
          "<tr><td>" +
          esc(c.label) +
          '</td><td style="text-align:right;">' +
          fmt(c.pagamento) +
          '</td><td style="text-align:right;">' +
          fmt(c.recebimento) +
          '</td><td style="text-align:right;">' +
          fmt(acc) +
          "</td></tr>"
        );
      })
      .join("");
    type Forma = { label: string; pagamento: number; recebimento: number };
    const formas = new Map<string, Forma>();
    for (const m of movs) {
      if (m.tipo === "abertura" || m.tipo === "fechamento" || m.tipo === "reabertura") continue;
      const bucket = normalizarForma(m.forma_pagamento) || "—";
      const v = Number(m.valor || 0);
      const sinal = TIPO_SINAL[m.tipo];
      if (sinal === 0) continue;
      // Decompõe pagamentos mistos usando as observações do lançamento
      // (mesma lógica exibida em tela) para que o "Resumo por tipo de moeda"
      // some cada parte na forma real (Dinheiro, PIX, Crédito, etc.) em vez
      // de agrupar tudo em "MISTO".
      const partes = bucket === "misto" ? partesDoMov(m) : {};
      const entradas = Object.entries(partes).filter(([, val]) => (val ?? 0) > 0) as Array<
        [FormaBucket, number]
      >;
      const totalPartes = entradas.reduce((s, [, val]) => s + (val ?? 0), 0);
      if (bucket === "misto" && entradas.length > 0 && totalPartes > 0) {
        for (const [k, val] of entradas) {
          const label = (FORMA_LABEL[k] ?? k).toUpperCase();
          const f = formas.get(label) ?? { label, pagamento: 0, recebimento: 0 };
          // Se o total decomposto não bater com o valor do movimento
          // (arredondamento raro), rateia proporcionalmente.
          const parte = totalPartes === v ? (val ?? 0) : ((val ?? 0) * v) / totalPartes;
          if (sinal < 0) f.pagamento += parte;
          else f.recebimento += parte;
          formas.set(label, f);
        }
      } else {
        const label = ((FORMA_LABEL[bucket as FormaBucket] ?? bucket) as string).toUpperCase();
        const f = formas.get(label) ?? { label, pagamento: 0, recebimento: 0 };
        if (sinal < 0) f.pagamento += v;
        else f.recebimento += v;
        formas.set(label, f);
      }
    }
    let accF = 0;
    const linhasForma = Array.from(formas.values())
      .map((f) => {
        accF += f.recebimento - f.pagamento;
        return (
          "<tr><td>" +
          esc(f.label) +
          '</td><td style="text-align:right;">' +
          fmt(f.pagamento) +
          '</td><td style="text-align:right;">' +
          fmt(f.recebimento) +
          '</td><td style="text-align:right;">' +
          fmt(accF) +
          "</td></tr>"
        );
      })
      .join("");
    const qtd = movs.filter(
      (m) => m.tipo !== "abertura" && m.tipo !== "fechamento" && m.tipo !== "reabertura",
    ).length;
    const reaberturas = movs.filter((m) => m.tipo === "reabertura");
    const linhasReabertura =
      reaberturas.length === 0
        ? ""
        : '<div style="margin-top:10px;font-size:11px;color:#7c3aed;"><strong>Reaberturas de fechamento:</strong><ul style="margin:4px 0 0 16px;padding:0;">' +
          reaberturas
            .map(
              (m) =>
                "<li>" +
                esc(
                  new Date(m.created_at).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                ) +
                " — " +
                esc(m.descricao || "sem detalhes") +
                "</li>",
            )
            .join("") +
          "</ul></div>";
    const emissao = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const style =
      "body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;} h1{font-size:16px;margin:0 0 6px;text-align:center;letter-spacing:.5px;} .meta{font-size:11px;color:#475569;margin-bottom:10px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;} table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;} th,td{padding:5px 6px;border-bottom:1px solid #cbd5e1;} thead th{border-bottom:2px solid #0f172a;text-align:left;} thead th.n{text-align:right;} tfoot td{border-top:2px solid #0f172a;font-weight:700;} .right{text-align:right;}";
    const empty =
      '<tr><td colspan="4" style="text-align:center;color:#64748b;">Sem movimentos</td></tr>';
    const html =
      '<!doctype html><html><head><meta charset="utf-8"/><title>Relatório de movimento de caixa</title><style>' +
      style +
      "</style></head><body>" +
      '<div class="meta"><span>Emitido: ' +
      esc(emissao) +
      "</span></div>" +
      "<h1>RELATÓRIO DE MOVIMENTO DE CAIXA</h1>" +
      '<div class="meta"><span>Tipo: TODOS (SEM TRANSFERÊNCIA)</span><span>Período: ' +
      esc(periodo) +
      "</span><span>Agrupar: CATEGORIA</span></div>" +
      (subtitulo ? '<div class="meta"><span>' + esc(subtitulo) + "</span></div>" : "") +
      '<table><thead><tr><th>GERAL — Descrição</th><th class="n">Pagamento</th><th class="n">Recebimento</th><th class="n">Acumulado</th></tr></thead><tbody>' +
      (linhasCat || empty) +
      "</tbody></table>" +
      '<table><thead><tr><th>Resumo por tipo de moeda</th><th class="n">Pagamento</th><th class="n">Recebimento</th><th class="n">Acumulado</th></tr></thead><tbody>' +
      (linhasForma || empty) +
      "</tbody>" +
      '<tfoot><tr><td>TOTAL</td><td class="right">' +
      fmt(totPag) +
      '</td><td class="right">' +
      fmt(totReceb) +
      '</td><td class="right">' +
      fmt(totReceb - totPag) +
      "</td></tr></tfoot></table>" +
      '<div class="meta"><span>' +
      qtd +
      " registro" +
      (qtd === 1 ? "" : "s") +
      "</span></div>" +
      linhasReabertura +
      "<script>window.onload=function(){window.print();}</script></body></html>";
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Bloqueador de pop-up impediu a impressão");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const exportarTodos = () => {
    const rows = linhasTodosPorDia.map((l) => ({
      Operador: l.user_nome,
      Dia: fmtDia(l.data),
      "Abertura (hora)": fmtHora(l.primeiraAbertura),
      "Fechamento (hora)": fmtHora(l.ultimoFechamento),
      Status: l.statusDia,
      "Valor abertura": l.valorAbertura,
      "Saldo calculado": l.calculado,
      "Valor informado": l.informado,
      Sangria: l.sangria,
      Estorno: l.estorno,
      Diferenca: l.diferenca,
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
      Usuario: usuarioNomeFor(m),
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
        <td>${esc(usuarioNomeFor(m))}</td>
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
        <th>Data</th><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th>Usuário</th><th style="text-align:right;">Valor</th>
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
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Wallet className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Caixa</h1>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "meu" | "todos" | "repasse")}>
        <TabsList className="bg-slate-100/80 p-1 rounded-xl inline-flex items-center gap-1 h-auto">
          <TabsTrigger
            value="meu"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            Meu caixa
          </TabsTrigger>
          {isManager && (
            <TabsTrigger
              value="todos"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <Users className="h-3.5 w-3.5 mr-1.5" /> Todos (Financeiro)
            </TabsTrigger>
          )}
          {podeLancarRecebDespesa && (
            <TabsTrigger
              value="repasse"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <HandCoins className="h-3.5 w-3.5 mr-1.5" /> Repasse médico
            </TabsTrigger>
          )}
        </TabsList>

        {/* ===================== MEU CAIXA ===================== */}
        <TabsContent value="meu" className="space-y-4 pt-4">
          {/*
            Aviso de caixa de dia anterior em aberto.
            Fica FORA das sub-abas de propósito: a atendente costuma abrir a
            tela já na aba Saldo e nunca chegaria a um aviso escondido em
            Histórico. Sem ele, o caixa da véspera simplesmente sumia — a tela
            passa a mostrar o caixa novo do dia e o antigo não aparece em lugar
            nenhum.
          */}
          {sessoesPendentes.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-amber-900">
                      {sessoesPendentes.length === 1
                        ? "Você tem um caixa de outro dia sem fechar"
                        : `Você tem ${sessoesPendentes.length} caixas de outros dias sem fechar`}
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      Enquanto não for fechado, o dinheiro daquele dia continua sem conferência.
                      Confira o valor com o cupom e feche — o caixa de hoje não é afetado.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {sessoesPendentes.map((s) => {
                      const dia = localYMD(s.aberto_em);
                      const emExibicao = minhaSessao?.id === s.id;
                      return (
                        <div
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-slate-700">
                            Caixa de {new Date(`${dia}T00:00:00`).toLocaleDateString("pt-BR")}
                            <span className="ml-2 font-normal text-slate-500">
                              aberto às{" "}
                              {new Date(s.aberto_em).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                          {emExibicao ? (
                            <span className="text-xs font-bold text-amber-700">
                              Em exibição abaixo
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer"
                              onClick={() => setSessaoAtivaId(s.id)}
                            >
                              <Lock className="h-3.5 w-3.5" /> Conferir e fechar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/*
            Faixa do modo conferência: deixa explícito de qual DIA é o caixa na
            tela. Sem isso a atendente veria saldos que não batem com a gaveta
            dela e acharia que o sistema errou de novo.
          */}
          {modoConferencia && diaSessaoAtiva && (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-300 bg-slate-100 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-slate-800">
                Você está vendo o caixa de{" "}
                {new Date(`${diaSessaoAtiva}T00:00:00`).toLocaleDateString("pt-BR")} — somente
                conferência e fechamento.
              </p>
              {sessaoDeHoje ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg cursor-pointer"
                  onClick={() => setSessaoAtivaId(sessaoDeHoje.id)}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao caixa de hoje
                </button>
              ) : (
                <span className="text-xs text-slate-600">
                  Nenhum caixa aberto hoje ainda — ele abre sozinho na primeira cobrança.
                </span>
              )}
            </div>
          )}

          {loading && (
            <ListSkeleton
              rows={4}
              fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}
            />
          )}

          {!loading && (
            <Tabs defaultValue="saldo" className="w-full">
              <TabsList className="bg-transparent p-0 h-auto gap-4 border-b border-slate-200/80 rounded-none w-full justify-start">
                {[
                  { v: "saldo", l: "Saldo" },
                  { v: "movimentos", l: "Movimentos" },
                  { v: "historico", l: "Histórico" },
                  { v: "aguardando", l: "Aguardando" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.v}
                    value={t.v}
                    className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 text-sm font-semibold text-slate-500 shadow-none data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:text-indigo-700 data-[state=active]:shadow-none"
                  >
                    {t.l}
                  </TabsTrigger>
                ))}
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
                    {/* Barra de ações — sangria/suprimento em destaque no topo */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/80 p-3.5 rounded-xl shadow-xs">
                      {modoConferencia ? (
                        <p className="text-xs font-semibold text-slate-500">
                          Lançamentos bloqueados: este caixa é de um dia que já passou.
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm cursor-pointer transition-colors"
                            onClick={() => setOpenMov({ tipo: "suprimento" })}
                          >
                            <ArrowDownToLine className="h-4 w-4" /> Novo suprimento
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm cursor-pointer transition-colors"
                            onClick={() => setOpenMov({ tipo: "sangria" })}
                          >
                            <ArrowUpFromLine className="h-4 w-4" /> Nova sangria
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 shadow-xs cursor-pointer transition-colors"
                            onClick={() => setOpenMov({ tipo: "estorno" })}
                          >
                            <Undo2 className="h-4 w-4 text-fuchsia-600" /> Estorno
                          </button>
                          {podeLancarRecebDespesa && (
                            <>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 shadow-xs cursor-pointer transition-colors"
                                onClick={() => setOpenMov({ tipo: "recebimento" })}
                              >
                                <PlusCircle className="h-4 w-4 text-emerald-600" /> Recebimento
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 shadow-xs cursor-pointer transition-colors"
                                onClick={() => setOpenMov({ tipo: "despesa" })}
                              >
                                <MinusCircle className="h-4 w-4 text-rose-600" /> Despesa
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
                        onClick={() => {
                          if (minhaSessao) {
                            setConferidoOwn(conferenciaInicial(porFormaDoDiaFechamento));
                          }
                          setOpenFechar(true);
                        }}
                      >
                        <Lock className="h-4 w-4" /> Conferir e fechar caixa
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        {
                          key: "saldo",
                          label: "Saldo atual",
                          value: saldoAtual,
                          cls: "text-indigo-950",
                        },
                        {
                          key: "abertura",
                          label: "Abertura",
                          value: minhaSessao.valor_abertura,
                          cls: "text-slate-800",
                        },
                        {
                          key: "entradas",
                          label: "Entradas",
                          value: resumoTipos.suprimento + resumoTipos.recebimento,
                          cls: "text-emerald-600",
                        },
                        {
                          key: "saidas",
                          label: "Saídas",
                          value: resumoTipos.sangria + resumoTipos.despesa,
                          cls: "text-rose-600",
                        },
                      ].map((kpi) => (
                        <button
                          key={kpi.key}
                          type="button"
                          onClick={() =>
                            setCaixaDrill(kpi.key as "saldo" | "abertura" | "entradas" | "saidas")
                          }
                          className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs flex flex-col justify-between gap-2 text-left hover:border-slate-300 transition-colors cursor-pointer"
                        >
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {kpi.label}
                          </span>
                          <span className={`text-2xl font-bold tabular-nums ${kpi.cls}`}>
                            {fmt(kpi.value)}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Quebra por forma de pagamento + memória de cálculo da gaveta */}
                    <ResumoFormas porForma={porFormaSessaoAtual} gaveta={gavetaSessaoAtual} />

                    {/* Linha do tempo de sangrias e suprimentos do turno */}
                    <TimelineGaveta
                      movimentos={movsGaveta}
                      onNovaSangria={
                        modoConferencia ? undefined : () => setOpenMov({ tipo: "sangria" })
                      }
                      onNovoSuprimento={
                        modoConferencia ? undefined : () => setOpenMov({ tipo: "suprimento" })
                      }
                    />

                    <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs mt-4 space-y-3">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Movimentação por dia
                      </div>
                      <div className="space-y-4">
                        {resumoPorDia.length === 0 ? (
                          <p className="text-sm text-slate-400">Sem movimentações nesta sessão.</p>
                        ) : (
                          resumoPorDia.map((d) => {
                            const cards: Array<{ label: string; value: number; sempre?: boolean }> =
                              [
                                {
                                  label: "Dinheiro",
                                  value: d.porForma.dinheiro ?? 0,
                                  sempre: true,
                                },
                                { label: "PIX", value: d.porForma.pix ?? 0, sempre: true },
                                { label: "Débito", value: d.porForma.debito ?? 0, sempre: true },
                                { label: "Crédito", value: d.porForma.credito ?? 0, sempre: true },
                                { label: "Boleto", value: d.porForma.boleto ?? 0 },
                                { label: "Transferência", value: d.porForma.transferencia ?? 0 },
                                { label: "Convênio", value: d.porForma.convenio ?? 0 },
                                { label: "Outros", value: d.porForma.outros ?? 0 },
                              ];
                            const visiveis = cards.filter(
                              (c) => c.sempre || (c.value ?? 0) > 0.005,
                            );
                            return (
                              <div
                                key={d.dia}
                                className="rounded-lg border border-slate-200/70 p-3 space-y-3 bg-white"
                              >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <div className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                                    <CalendarIcon className="h-4 w-4 text-slate-400" />
                                    {d.label}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 text-xs tabular-nums">
                                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700">
                                      Entradas: {fmt(d.entradas)}
                                    </span>
                                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-50 text-rose-700">
                                      Saídas: {fmt(d.saidas)}
                                    </span>
                                    <span
                                      className={`text-xs font-semibold px-2.5 py-1 rounded-md ${d.saldo >= 0 ? "bg-indigo-50 text-indigo-700" : "bg-rose-50 text-rose-700"}`}
                                    >
                                      Saldo do dia: {fmt(d.saldo)}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  {visiveis.map((it) => (
                                    <div
                                      key={it.label}
                                      className="bg-slate-50/70 border border-slate-200/60 rounded-lg p-3"
                                    >
                                      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                                        {it.label}
                                      </div>
                                      <div className="text-base font-bold tabular-nums text-slate-800">
                                        {fmt(it.value)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
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
                        Cobrança de pacientes ({filaCaixa.filter((f) => !f.ja_pago).length}{" "}
                        aguardando)
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
                                    <span className="font-semibold text-primary">
                                      {fmt(f.valor)}
                                    </span>
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
                                    onClick={() => void abrirCobranca(f)}
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
                <Card>
                  <CardHeader className="gap-3">
                    <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base">
                        Meus movimentos
                        {filtrosAtivos && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({minhasMovsFiltrados.length} de {minhasMovsHist.length})
                          </span>
                        )}
                        {movsNoTeto && (
                          <span className="ml-2 text-xs font-normal text-amber-700">
                            mostrando os {LIMITE_MOVS.toLocaleString("pt-BR")} movimentos mais
                            recentes do período
                          </span>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => imprimirRelatorioMovs(minhasMovsFiltrados, periodoLabel)}
                          disabled={minhasMovsFiltrados.length === 0}
                        >
                          <Printer className="h-4 w-4 mr-1" /> Relatório
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div>
                        <Label className="text-xs">Período</Label>
                        <Popover open={openCal} onOpenChange={setOpenCal}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 justify-start font-normal min-w-[220px]"
                            >
                              <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                              {periodoLabel}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <div className="flex flex-col sm:flex-row">
                              <div className="flex sm:flex-col gap-1 p-2 border-b sm:border-b-0 sm:border-r bg-muted/30">
                                {(
                                  [
                                    ["hoje", "Hoje"],
                                    ["semana", "Última semana"],
                                    ["quinzena", "Última quinzena"],
                                    ["mes", "Último mês"],
                                    ["todos", "Todos"],
                                  ] as const
                                ).map(([v, lbl]) => (
                                  <Button
                                    key={v}
                                    type="button"
                                    variant={meuPeriodo === v ? "default" : "ghost"}
                                    size="sm"
                                    className="justify-start text-xs h-7"
                                    onClick={() => {
                                      setMeuPeriodo(v);
                                      setOpenCal(false);
                                    }}
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
                      </div>
                      <div>
                        <Label className="text-xs">Médico</Label>
                        <Select value={meuMedico} onValueChange={setMeuMedico}>
                          <SelectTrigger className="h-8 w-[200px]">
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">Todos os médicos</SelectItem>
                            {medicosDisponiveis.map((n) => (
                              <SelectItem key={n} value={n}>
                                {n}
                              </SelectItem>
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
                          <TableHead>Paciente</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Serviço</TableHead>
                          <TableHead>Médico</TableHead>
                          <TableHead>Ficha</TableHead>
                          <TableHead>Usuário</TableHead>
                          <TableHead>Forma</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          {/* Coluna fixada à direita: a tabela tem 12 colunas e
                              estoura a largura da tela, então o botão "Solicitar
                              estorno" ficava fora do campo de visão e o usuário
                              concluía que ele não existia. Fixa, o botão está
                              sempre visível sem precisar rolar de lado. */}
                          <TableHead className="text-right w-[1%] right-0 z-30 border-l">
                            Ação
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {minhasMovsFiltrados.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center text-muted-foreground">
                              {filtrosAtivos
                                ? "Nenhum movimento corresponde aos filtros"
                                : "Sem movimentos no período"}
                              {/* O escopo desta aba é o caixa DO USUÁRIO. Sem
                                  esta linha, quem procurava aqui um
                                  recebimento feito por outro operador concluía
                                  que o registro tinha sumido do sistema. */}
                              <div className="mt-1 text-xs">
                                Esta lista mostra apenas o seu caixa.
                                {isManager
                                  ? ' O que outro operador recebeu aparece na aba "Todos (Financeiro)".'
                                  : ""}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          minhasMovsFiltrados.flatMap((m) => {
                            const enr = m.lancamento_id
                              ? enrichPorLanc.get(m.lancamento_id)
                              : undefined;
                            const servico = enr?.servico ?? servicoFromDescricao(m.descricao);
                            const medico = enr?.medico ?? null;
                            const ficha = enr?.ficha ?? null;
                            const paciente = enr?.paciente ?? pacienteFromDescricao(m.descricao);
                            const usuario = usuarioNomeFor(m);
                            const bucket = bucketDeMov(m);
                            const partes = bucket === "misto" ? partesDoMov(m) : {};
                            const entradas = Object.entries(partes).filter(
                              ([, v]) => (v ?? 0) > 0.005,
                            ) as Array<[FormaBucket, number]>;
                            if (bucket === "misto" && entradas.length > 0) {
                              return entradas.map(([k, v], idx) => (
                                <TableRow key={`${m.id}-${k}`}>
                                  <TableCell className="whitespace-nowrap">
                                    {idx === 0
                                      ? new Date(m.created_at).toLocaleDateString("pt-BR")
                                      : ""}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {idx === 0
                                      ? new Date(m.created_at).toLocaleTimeString("pt-BR", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : ""}
                                  </TableCell>
                                  <TableCell>
                                    {idx === 0 ? (
                                      <Badge variant="outline" className={TIPO_CLASS[m.tipo]}>
                                        {TIPO_LABEL[m.tipo]}
                                      </Badge>
                                    ) : null}
                                  </TableCell>
                                  <TableCell
                                    className="text-xs uppercase font-medium max-w-[220px] truncate"
                                    title={paciente ?? undefined}
                                  >
                                    {idx === 0 ? paciente || "—" : ""}
                                  </TableCell>
                                  <TableCell
                                    className="max-w-[320px] truncate"
                                    title={m.descricao ?? undefined}
                                  >
                                    {idx === 0 ? (
                                      m.descricao || "—"
                                    ) : (
                                      <span className="text-muted-foreground text-xs pl-2">
                                        ↳ parcela
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {idx === 0 ? servico || "—" : ""}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {idx === 0 ? medico || "—" : ""}
                                  </TableCell>
                                  <TableCell className="text-xs tabular-nums">
                                    {idx === 0 ? formatFichaCaixa(ficha) : ""}
                                  </TableCell>
                                  <TableCell className="text-xs uppercase" title={usuario}>
                                    {idx === 0 ? usuario : ""}
                                  </TableCell>
                                  <TableCell className="text-xs">{FORMA_LABEL[k] ?? k}</TableCell>
                                  <TableCell
                                    className={`text-right font-medium ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}
                                  >
                                    {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                                    {fmt(v)}
                                  </TableCell>
                                  <TableCell className="text-right sticky right-0 z-10 bg-card border-l"></TableCell>
                                </TableRow>
                              ));
                            }
                            return [
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
                                <TableCell
                                  className="text-xs uppercase font-medium max-w-[220px] truncate"
                                  title={paciente ?? undefined}
                                >
                                  {paciente || "—"}
                                </TableCell>
                                <TableCell
                                  className="max-w-[320px] truncate"
                                  title={m.descricao ?? undefined}
                                >
                                  {m.descricao || "—"}
                                </TableCell>
                                <TableCell className="text-xs">{servico || "—"}</TableCell>
                                <TableCell className="text-xs">{medico || "—"}</TableCell>
                                <TableCell className="text-xs tabular-nums">
                                  {formatFichaCaixa(ficha)}
                                </TableCell>
                                <TableCell className="text-xs uppercase" title={usuario}>
                                  {usuario}
                                </TableCell>
                                <TableCell>
                                  <FormaCellEditavel m={m} />
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}
                                >
                                  {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                                  {fmt(m.valor)}
                                </TableCell>
                                <TableCell className="text-right sticky right-0 z-10 bg-card border-l">
                                  {m.tipo === "recebimento" &&
                                    podeEscrever &&
                                    (() => {
                                      const st = m.lancamento_id
                                        ? estornosPorLanc.get(m.lancamento_id)
                                        : undefined;
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
                                    })()}
                                  {m.tipo === "sangria" &&
                                    podeEscrever &&
                                    (() => {
                                      const st = estornosPorMov.get(m.id);
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
                                            title="Esta sangria já foi estornada"
                                          >
                                            <Undo2 className="h-3 w-3 mr-1" /> Estornada
                                          </Button>
                                        );
                                      }
                                      return (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                          title="Solicitar estorno da sangria ao financeiro"
                                          onClick={() => setEstornoFor(m)}
                                        >
                                          <Undo2 className="h-3 w-3 mr-1" /> Solicitar estorno
                                        </Button>
                                      );
                                    })()}
                                </TableCell>
                              </TableRow>,
                            ];
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
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
                      <CardTitle className="text-base">Caixas anteriores</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Dia</TableHead>
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
                          {linhasMinhasPorDia.map((l) => {
                            const sPrincipal = l.sessoes[0];
                            const st = statusCaixa(
                              l.statusDia === "aberto" ? "aberto" : "fechado",
                              l.diferenca,
                            );
                            return (
                              <TableRow key={l.key}>
                                <TableCell className="font-medium">{fmtDia(l.data)}</TableCell>
                                <TableCell>{fmtHora(l.primeiraAbertura)}</TableCell>
                                <TableCell>{fmtHora(l.ultimoFechamento)}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={`text-[11px] font-semibold ${STATUS_CAIXA_CLASS[st]}`}
                                  >
                                    {STATUS_CAIXA_LABEL[st]}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{fmt(l.valorAbertura)}</TableCell>
                                <TableCell className="text-right">{fmt(l.informado)}</TableCell>
                                <TableCell
                                  className={`text-right ${l.diferenca < 0 ? "text-rose-600" : l.diferenca > 0 ? "text-amber-600" : ""}`}
                                >
                                  {fmt(l.diferenca)}
                                </TableCell>
                                <TableCell>
                                  {sPrincipal && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => verDetalhe(sPrincipal)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
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
                  <DateInputBR value={fIni} onChange={(e) => setFIni(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <DateInputBR value={fFim} onChange={(e) => setFFim(e.target.value)} />
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
                <Button
                  variant="outline"
                  onClick={() => {
                    const hoje = new Date().toISOString().slice(0, 10);
                    setFIni(hoje);
                    setFFim(hoje);
                  }}
                  title="Filtrar apenas o dia de hoje"
                >
                  Hoje
                </Button>
                <Button variant="outline" onClick={exportarTodos}>
                  <FileDown className="h-4 w-4 mr-2" /> Excel
                </Button>
                {(() => {
                  const abertos = todasSessoes.filter((s) => s.status === "aberto").length;
                  if (abertos === 0) return null;
                  return (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        const inicial: Record<string, boolean> = {};
                        todasSessoes.forEach((s) => {
                          if (s.status === "aberto") inicial[s.id] = true;
                        });
                        setLoteSelecionados(inicial);
                        setObsLote("");
                        setOpenLote(true);
                      }}
                    >
                      <Lock className="h-4 w-4 mr-2" /> Fechar caixas abertos ({abertos})
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operador</TableHead>
                      <TableHead>Dia</TableHead>
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
                    {linhasTodosPorDia.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground">
                          Sem sessões no período
                        </TableCell>
                      </TableRow>
                    )}
                    {linhasTodosPorDia.map((l) => {
                      const sAberta = l.sessaoAbertaId
                        ? l.sessoes.find((x) => x.id === l.sessaoAbertaId)
                        : null;
                      const sPrincipal = sAberta ?? l.sessoes[0];
                      return (
                        <TableRow key={l.key}>
                          <TableCell className="font-medium uppercase">
                            {l.user_nome.toUpperCase()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDia(l.data)}</TableCell>
                          <TableCell>{fmtHora(l.primeiraAbertura)}</TableCell>
                          <TableCell>{fmtHora(l.ultimoFechamento)}</TableCell>
                          <TableCell>
                            <Badge variant={l.statusDia === "aberto" ? "default" : "secondary"}>
                              {l.statusDia}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{fmt(l.valorAbertura)}</TableCell>
                          <TableCell className="text-right">{fmt(l.calculado)}</TableCell>
                          <TableCell className="text-right">{fmt(l.informado)}</TableCell>
                          <TableCell
                            className={`text-right ${l.sangria > 0 ? "text-amber-700" : "text-muted-foreground"}`}
                          >
                            {fmt(l.sangria)}
                          </TableCell>
                          <TableCell
                            className={`text-right ${l.estorno > 0 ? "text-rose-700" : "text-muted-foreground"}`}
                          >
                            {fmt(l.estorno)}
                          </TableCell>
                          <TableCell
                            className={`text-right ${l.diferenca < 0 ? "text-rose-600" : l.diferenca > 0 ? "text-amber-600" : ""}`}
                          >
                            {fmt(l.diferenca)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {sPrincipal && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => verDetalhe(sPrincipal)}
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {sAberta && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Fechar este caixa"
                                onClick={() => {
                                  setOpenFecharTerceiro(sAberta);
                                  setObsTerceiro("");
                                  const porForma = entradasPorFormaSessao(sAberta.id);
                                  const inicial: Record<string, string> = {};
                                  let soma = 0;
                                  for (const k of Object.keys(porForma)) {
                                    const v = porForma[k] ?? 0;
                                    if (Math.abs(v) > 0.005 || k === "dinheiro") {
                                      inicial[k] = v.toFixed(2);
                                      soma += v;
                                    }
                                  }
                                  setConferidoTerceiro(inicial);
                                  setInformadoTerceiro(soma.toFixed(2));
                                }}
                              >
                                <Lock className="h-4 w-4" />
                              </Button>
                            )}
                            {!sAberta &&
                              l.statusDia === "fechado" &&
                              podeLancarRecebDespesa &&
                              (() => {
                                const sFechada = [...l.sessoes]
                                  .filter((x) => x.status === "fechado" && x.fechado_em)
                                  .sort((a, b) =>
                                    (b.fechado_em || "").localeCompare(a.fechado_em || ""),
                                  )[0];
                                if (!sFechada) return null;
                                return (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Desfazer fechamento (reabrir caixa)"
                                    onClick={() => {
                                      setOpenReabrir(sFechada);
                                      setMotivoReabrir("");
                                    }}
                                  >
                                    <Undo2 className="h-4 w-4 text-amber-700" />
                                  </Button>
                                );
                              })()}
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
          if (!o) {
            setOpenMov(null);
            setMovDescTouched(false);
          }
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
              {openMov?.tipo === "estorno" &&
                "Saída de dinheiro avulsa (ex.: troco, valor cobrado a mais). Descreva o motivo/paciente abaixo."}
            </DialogDescription>
          </DialogHeader>
          {/* Este botão é confundido com o estorno de atendimento: ele lança uma
              saída solta, que NÃO cancela a cobrança do paciente e que nenhuma
              tela consegue desfazer depois. O aviso abaixo existe para que a
              pessoa perceba isso antes de confirmar, e não depois. */}
          {openMov?.tipo === "estorno" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-semibold">
                Atenção: isto não estorna o atendimento de um paciente.
              </p>
              <p>
                Esta tela só tira dinheiro do caixa. A cobrança continua como paga no financeiro, o
                agendamento continua atendido, e{" "}
                <strong>este lançamento não pode ser desfeito</strong> por nenhuma tela do sistema.
              </p>
              <p>
                Para estornar o atendimento de um paciente, feche esta janela e use o botão{" "}
                <strong>"Solicitar estorno"</strong> na aba <strong>Movimentos</strong>, na linha do
                recebimento dele.
              </p>
            </div>
          )}
          <form onSubmit={lancarMov} className="space-y-3">
            <div>
              <Label>Valor</Label>
              <CurrencyInput value={movValor} onChange={setMovValor} />
              {/* Na sangria o operador precisa ver o teto ANTES de digitar: o
                  erro clássico é entregar um maço redondo (R$ 4.000,00) e
                  digitar o número redondo em vez do que saiu de fato. */}
              {openMov?.tipo === "sangria" &&
                (() => {
                  const pedido = Number(movValor) || 0;
                  const excede = pedido > esperadoGaveta + 0.005;
                  return (
                    <p
                      className={`mt-1 text-xs ${excede ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                    >
                      Dinheiro disponível na gaveta agora:{" "}
                      <strong>{fmt(Math.max(0, esperadoGaveta))}</strong>
                      {excede &&
                        ` — você está retirando ${fmt(pedido - esperadoGaveta)} a mais do que existe.`}
                    </p>
                  );
                })()}
            </div>
            <div>
              <Label>
                Descrição <span className="text-destructive">*</span>
              </Label>
              <Input
                value={movDesc}
                onChange={(e) => setMovDesc(e.target.value)}
                onBlur={() => setMovDescTouched(true)}
                placeholder="Motivo / referência"
                aria-invalid={movDescTouched && movDesc.trim().length < 3}
                aria-required="true"
              />
              {movDescTouched && movDesc.trim().length < 3 && (
                <p className="mt-1 text-xs text-destructive">
                  Descrição é obrigatória (mínimo 3 caracteres).
                </p>
              )}
            </div>
            {openMov && (openMov.tipo === "sangria" || openMov.tipo === "suprimento") && (
              <div>
                <Label>{openMov.tipo === "sangria" ? "Entregue a *" : "Recebido de *"}</Label>
                <Select value={movDestinoUserId} onValueChange={setMovDestinoUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o usuário..." />
                  </SelectTrigger>
                  <SelectContent>
                    {membrosClinica.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.nome}
                      </SelectItem>
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpenMov(null);
                  setMovDescTouched(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  movDesc.trim().length < 3 ||
                  !(Number(movValor) > 0) ||
                  (openMov?.tipo === "sangria" && (Number(movValor) || 0) > esperadoGaveta + 0.005)
                }
                data-primary
              >
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
              Fechando o dia{" "}
              <strong>
                {dataFechamento
                  ? new Date(`${dataFechamento}T00:00:00`).toLocaleDateString("pt-BR")
                  : "—"}
              </strong>
              {" · "}Saldo calculado do dia: <strong>{fmt(saldoDoDiaFechamento)}</strong>
              {" · "}Esperado em espécie:{" "}
              <strong>{fmt(porFormaDoDiaFechamento.dinheiro ?? 0)}</strong>
            </DialogDescription>
            {Math.abs(porFormaDoDiaFechamento.indeterminado ?? 0) > 0.005 && (
              <p className="text-xs text-destructive">
                Atenção: {fmt(porFormaDoDiaFechamento.indeterminado ?? 0)} sem forma de pagamento
                identificada (pagamento misto sem composição registrada). Esse valor NÃO foi somado
                ao esperado em espécie — confira manualmente antes de fechar.
              </p>
            )}
          </DialogHeader>
          {/* Bloqueio duro: alguma forma fechou negativa. Fica no topo porque o
              caixa não pode ser encerrado enquanto isso não for corrigido. */}
          {formasNegativasFechamento.length > 0 && (
            <div className="rounded-md border-2 border-destructive bg-destructive/10 p-3 text-xs text-destructive space-y-2">
              <p className="text-sm font-bold">
                Fechamento bloqueado: saldo negativo por forma de pagamento.
              </p>
              <ul className="space-y-0.5">
                {formasNegativasFechamento.map((f) => (
                  <li key={f.chave} className="tabular-nums">
                    <strong>{FORMA_LABEL[f.chave as FormaBucket] ?? f.chave}</strong>: calculado{" "}
                    {fmt(f.calculado)}
                    {Math.abs(f.conferido) > 0.005 ? ` · conferido ${fmt(f.conferido)}` : ""}
                  </li>
                ))}
              </ul>
              <p className="font-normal">
                Saldo negativo significa que saiu mais dinheiro dessa forma do que entrou — o que é
                impossível na prática. Quase sempre é uma <strong>sangria digitada a mais</strong>{" "}
                do que o valor realmente entregue, ou um recebimento que ainda não foi lançado.
                Confira os lançamentos do dia na aba Movimentos, corrija o valor errado e volte a
                fechar.
              </p>
              <p className="font-normal">
                Não encerre o caixa mesmo assim: o total do dia soma cartão e PIX, que não passam
                pela gaveta, e eles acabam escondendo o buraco do dinheiro — o fechamento sairia
                marcado como "confere" com a diferença ainda lá.
              </p>
            </div>
          )}
          <form onSubmit={fecharCaixa} className="space-y-3">
            <div>
              <Label>Dia a fechar</Label>
              {/* Campo fixo, de propósito.
                  Enquanto o dia era digitável, dava para encerrar o caixa
                  apontando para um dia sem movimento nenhum: o calculado saía
                  R$ 0,00, o conferido entrava inteiro e o sistema gravava uma
                  diferença que nunca existiu — foi o que aconteceu com o caixa
                  de 19/08/2026, fechado "no dia 18/08" com R$ 1.554,00 de
                  falta fantasma. O dia agora vem do próprio movimento do
                  caixa, e caixa com movimento em mais de um dia fecha todos
                  juntos. */}
              <div className="flex min-h-10 items-center rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold">
                {diasComMovimento.length > 0
                  ? diasComMovimento
                      .map((d) => new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR"))
                      .join(" + ")
                  : dataFechamento
                    ? new Date(`${dataFechamento}T00:00:00`).toLocaleDateString("pt-BR")
                    : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {fechamentoCobreTudo
                  ? `Este caixa tem movimento em ${diasComMovimento.length} dias e será fechado com todos eles juntos. Fechar um dia só encerraria o caixa do mesmo jeito e deixaria o resto do dinheiro preso dentro dele.`
                  : diasComMovimento.length === 0
                    ? "Este caixa não teve movimento. Ele será encerrado zerado."
                    : "O dia vem do movimento deste caixa e não pode ser trocado."}
              </p>
            </div>
            {minhaSessao &&
              (() => {
                const porForma = porFormaDoDiaFechamento;
                const ordem = [
                  "dinheiro",
                  "pix",
                  "debito",
                  "credito",
                  "boleto",
                  "transferencia",
                  "convenio",
                  "outros",
                  "indeterminado",
                ];
                // "Outros" só aparece se realmente houver saldo residual (ex.: parcela
                // de pagamento misto ainda não decomposta). Sangria/suprimento/despesa
                // agora contam em "Dinheiro" via bucketDeMov.
                const chaves = ordem.filter(
                  (k) =>
                    (k !== "outros" && k !== "indeterminado") || Math.abs(porForma[k] ?? 0) > 0.005,
                );
                return (
                  <div className="space-y-2">
                    <Label>Conferência por forma de pagamento</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {chaves.map((k) => {
                        const esperado = porForma[k] ?? 0;
                        return (
                          <div key={k} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">
                                {FORMA_LABEL[k as FormaBucket] ?? k}
                              </span>
                              <span className="text-muted-foreground">
                                Esperado: {fmt(esperado)}
                              </span>
                            </div>
                            <CurrencyInput
                              value={conferidoOwn[k] ?? ""}
                              onChange={(v) => setConferidoOwn((prev) => ({ ...prev, [k]: v }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t">
                      <span className="text-muted-foreground">Total conferido</span>
                      <strong>{fmt(totalConferidoOwn)}</strong>
                    </div>
                  </div>
                );
              })()}
            <div>
              <Label>Valor conferido em caixa</Label>
              {/* Somatório das formas acima — não é editável para não voltar a
                  divergir das partes conferidas. */}
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                {fmt(totalConferidoOwn)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Soma automática de todas as formas de pagamento conferidas acima.
              </p>
            </div>
            {(() => {
              const contadoDinheiro = Number(conferidoOwn.dinheiro ?? 0) || 0;
              const difGaveta = classificarDiferenca(contadoDinheiro, esperadoGaveta);
              const difTotal = classificarDiferenca(totalConferidoOwn, saldoDoDiaFechamento);
              return (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className={`rounded-lg border p-3 ${difGaveta.cls}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                      Dinheiro na gaveta
                    </div>
                    <div className="text-xs mt-0.5">
                      Esperado {fmt(esperadoGaveta)} · Contado {fmt(contadoDinheiro)}
                    </div>
                    <div className="text-lg font-bold tabular-nums mt-1">
                      {difGaveta.label}
                      {difGaveta.tipo !== "exato" ? `: ${fmt(Math.abs(difGaveta.valor))}` : ""}
                    </div>
                  </div>
                  <div className={`rounded-lg border p-3 ${difTotal.cls}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                      Total do dia (todas as formas)
                    </div>
                    <div className="text-xs mt-0.5">
                      Calculado {fmt(saldoDoDiaFechamento)} · Conferido {fmt(totalConferidoOwn)}
                    </div>
                    <div className="text-lg font-bold tabular-nums mt-1">
                      {difTotal.label}
                      {difTotal.tipo !== "exato" ? `: ${fmt(Math.abs(difTotal.valor))}` : ""}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div>
              <Label>Observações (justifique sobras ou faltas)</Label>
              <Textarea value={obsFechamento} onChange={(e) => setObsFechamento(e.target.value)} />
            </div>
            <div>
              <Label>Comprovante</Label>
              <Select
                value={formatoFechamento}
                onValueChange={(v) => setFormatoFechamento(v as "80mm" | "a4")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="80mm">Bobina térmica 80mm</SelectItem>
                  <SelectItem value="a4">Folha A4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenFechar(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={saving || formasNegativasFechamento.length > 0}
                data-primary
              >
                <Printer className="h-4 w-4 mr-2" /> Encerrar e imprimir fechamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Desfazer fechamento (admin/gestor/financeiro) === */}
      <Dialog
        open={!!openReabrir}
        onOpenChange={(o) => {
          if (!o) {
            setOpenReabrir(null);
            setMotivoReabrir("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desfazer fechamento do caixa</DialogTitle>
            {openReabrir && (
              <DialogDescription>
                Operador:{" "}
                <strong className="uppercase">
                  {openReabrir.user_nome || openReabrir.user_id.slice(0, 8)}
                </strong>
                <br />
                Calculado:{" "}
                <strong>{fmt(Number(openReabrir.valor_fechamento_calculado || 0))}</strong>
                {" · "}Informado:{" "}
                <strong>{fmt(Number(openReabrir.valor_fechamento_informado || 0))}</strong>
                {" · "}Diferença: <strong>{fmt(Number(openReabrir.diferenca || 0))}</strong>
                <br />
                <span className="text-xs text-muted-foreground">
                  O caixa voltará ao status "aberto". O histórico de fechamento fica registrado e
                  uma linha de reabertura será adicionada aos movimentos do operador.
                </span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-reabrir">Motivo (obrigatório)</Label>
            <Textarea
              id="motivo-reabrir"
              value={motivoReabrir}
              onChange={(e) => setMotivoReabrir(e.target.value)}
              placeholder="Ex.: valor informado incorreto, sangria pendente..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenReabrir(null);
                setMotivoReabrir("");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={saving || !motivoReabrir.trim()}
              onClick={() => void desfazerFechamento()}
            >
              <Undo2 className="h-4 w-4 mr-2" /> Reabrir caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Modal Fechar caixa de OUTRO usuário (gestor/admin) === */}
      <Dialog
        open={!!openFecharTerceiro}
        onOpenChange={(o) => {
          if (!o) setOpenFecharTerceiro(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar caixa de outro operador</DialogTitle>
            {openFecharTerceiro && (
              <DialogDescription>
                Operador:{" "}
                <strong className="uppercase">
                  {openFecharTerceiro.user_nome || openFecharTerceiro.user_id.slice(0, 8)}
                </strong>
                <br />
                Saldo calculado: <strong>{fmt(calcSaldoSessao(openFecharTerceiro.id))}</strong>
              </DialogDescription>
            )}
          </DialogHeader>
          {formasNegativasTerceiro.length > 0 && (
            <div className="rounded-md border-2 border-destructive bg-destructive/10 p-3 text-xs text-destructive space-y-2">
              <p className="text-sm font-bold">
                Fechamento bloqueado: saldo negativo por forma de pagamento.
              </p>
              <ul className="space-y-0.5">
                {formasNegativasTerceiro.map((f) => (
                  <li key={f.chave} className="tabular-nums">
                    <strong>{FORMA_LABEL[f.chave as FormaBucket] ?? f.chave}</strong>: calculado{" "}
                    {fmt(f.calculado)}
                    {Math.abs(f.conferido) > 0.005 ? ` · conferido ${fmt(f.conferido)}` : ""}
                  </li>
                ))}
              </ul>
              <p className="font-normal">
                Saiu mais dinheiro dessa forma do que entrou — normalmente uma sangria digitada a
                mais do que o valor entregue, ou um recebimento que ficou sem lançar. Corrija o
                lançamento no caixa deste operador antes de encerrar.
              </p>
            </div>
          )}
          <form onSubmit={fecharSessaoTerceiro} className="space-y-3">
            {openFecharTerceiro &&
              (() => {
                const porForma = entradasPorFormaSessao(openFecharTerceiro.id);
                const ordem = [
                  "dinheiro",
                  "pix",
                  "debito",
                  "credito",
                  "boleto",
                  "transferencia",
                  "convenio",
                  "outros",
                  "indeterminado",
                ];
                const chaves = ordem.filter(
                  (k) =>
                    (k !== "outros" && k !== "indeterminado") || Math.abs(porForma[k] ?? 0) > 0.005,
                );
                const totalTerceiro = totalConferido(conferidoTerceiro);
                return (
                  <div className="space-y-2">
                    <Label>Conferência por forma de pagamento</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {chaves.map((k) => {
                        const esperado = porForma[k] ?? 0;
                        return (
                          <div key={k} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">
                                {FORMA_LABEL[k as FormaBucket] ?? k}
                              </span>
                              <span className="text-muted-foreground">
                                Esperado: {fmt(esperado)}
                              </span>
                            </div>
                            <CurrencyInput
                              value={conferidoTerceiro[k] ?? ""}
                              onChange={(v) => {
                                setConferidoTerceiro((prev) => {
                                  const next = { ...prev, [k]: v };
                                  const soma = Object.values(next).reduce(
                                    (a, x) => a + (Number(x) || 0),
                                    0,
                                  );
                                  setInformadoTerceiro(soma.toFixed(2));
                                  return next;
                                });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t">
                      <span className="text-muted-foreground">Total conferido</span>
                      <strong>{fmt(totalTerceiro)}</strong>
                    </div>
                  </div>
                );
              })()}
            <div>
              <Label>Data do fechamento</Label>
              <DateInputBR
                value={dataFechamentoTerceiro}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDataFechamentoTerceiro(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Dia a que este fechamento se refere.
              </p>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={obsTerceiro}
                onChange={(e) => setObsTerceiro(e.target.value)}
                placeholder="Motivo do fechamento pelo gestor (ex.: operador ausente, fim de turno etc.)"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpenFecharTerceiro(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={saving || formasNegativasTerceiro.length > 0}
                data-primary
              >
                Confirmar fechamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* === Modal Fechamento em lote (por dia/período) === */}
      <Dialog open={openLote} onOpenChange={setOpenLote}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fechar caixas abertos no período</DialogTitle>
            <DialogDescription>
              Cada caixa selecionado será fechado com o valor <strong>calculado</strong> (diferença
              = 0). Use quando os operadores esquecem de fechar o próprio caixa ao fim do dia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Abertura</TableHead>
                    <TableHead className="text-right">Calculado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todasSessoes.filter((s) => s.status === "aberto").length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum caixa aberto no período.
                      </TableCell>
                    </TableRow>
                  )}
                  {todasSessoes
                    .filter((s) => s.status === "aberto")
                    .map((s) => {
                      const calc = calcSaldoSessao(s.id);
                      const checked = !!loteSelecionados[s.id];
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setLoteSelecionados((prev) => ({
                                  ...prev,
                                  [s.id]: e.target.checked,
                                }))
                              }
                              className="h-4 w-4"
                            />
                          </TableCell>
                          <TableCell className="uppercase font-medium">
                            {(s.user_nome || s.user_id.slice(0, 8)).toUpperCase()}
                          </TableCell>
                          <TableCell>{fmtDT(s.aberto_em)}</TableCell>
                          <TableCell className="text-right">{fmt(calc)}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
            <div>
              <Label>Observação (aplicada a todos)</Label>
              <Textarea
                value={obsLote}
                onChange={(e) => setObsLote(e.target.value)}
                placeholder="Ex.: Fechamento de fim de dia — operadores não fecharam o caixa."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpenLote(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void fecharLote()}
              data-primary
            >
              <Lock className="h-4 w-4 mr-2" />
              Confirmar fechamento em lote
            </Button>
          </DialogFooter>
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
            {calculandoPreco && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Conferindo convênio do paciente…
              </div>
            )}
            {!calculandoPreco && precoCobranca?.convenioNome && (
              <div
                className={
                  precoCobranca.cobrandoParticular
                    ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    : "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                }
              >
                <div className="font-medium">
                  {precoCobranca.cobrandoParticular
                    ? `Convênio ${precoCobranca.convenioNome} — sem benefício neste atendimento`
                    : `Convênio ${precoCobranca.convenioNome} · ${precoCobranca.rotuloBeneficio}`}
                </div>
                {!precoCobranca.cobrandoParticular && (
                  <div className="mt-0.5">
                    {precoCobranca.memoriaDinheiro} · cartão/PIX {fmt(precoCobranca.valorCartao)}{" "}
                    <span className="text-emerald-700/70">
                      (particular {fmt(precoCobranca.baseDinheiro)})
                    </span>
                  </div>
                )}
                {precoCobranca.aviso && <div className="mt-0.5">{precoCobranca.aviso}</div>}
                {precoCobranca.gratuidade && (
                  <div className="mt-0.5 font-medium">
                    Cortesia do convênio — confira antes de confirmar.
                  </div>
                )}
              </div>
            )}
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
                              i === idx
                                ? {
                                    ...x,
                                    forma: v,
                                    bandeira: "",
                                    parcelas: "1",
                                    // Rastro do pagamento antigo só vale para
                                    // a forma que o pede — trocar de forma
                                    // não pode deixar data/recibo órfãos.
                                    pagoEm: "",
                                    recibo: "",
                                  }
                                : x,
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
                          {/* Transição de sistemas: paciente já pagou na
                              Clínica Total. Por último porque é exceção — e
                              porque tira o valor do fechamento do dia. */}
                          <SelectItem value={FORMA_PAGO_SISTEMA_ANTERIOR}>
                            {LABEL_PAGO_SISTEMA_ANTERIOR}
                          </SelectItem>
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
                  {l.forma === FORMA_PAGO_SISTEMA_ANTERIOR && (
                    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                      <p className="text-[11px] text-amber-900">
                        <strong>Já pago na Clínica Total.</strong> A guia é liberada e o repasse do
                        prestador é apurado normalmente, mas este valor{" "}
                        <strong>não entra no fechamento do caixa de hoje</strong>.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Pago em</Label>
                          <DateInputBR
                            value={l.pagoEm ?? ""}
                            onChange={(e) =>
                              setCobrancaLinhas((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, pagoEm: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Nº do recibo anterior</Label>
                          <Input
                            value={l.recibo ?? ""}
                            onChange={(e) =>
                              setCobrancaLinhas((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, recibo: e.target.value } : x,
                                ),
                              )
                            }
                            placeholder="Ex.: 48213"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        Preencha ao menos um dos dois — é o que liga esta guia ao recebimento feito
                        no sistema antigo.
                      </p>
                    </div>
                  )}
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
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
              <DialogTitle>Sessão de caixa</DialogTitle>
              {openDetalhe && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={exportarDetalhe}>
                    <FileDown className="h-4 w-4 mr-1" /> Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      imprimirRelatorioMovs(
                        detalheMovs,
                        `${new Date(openDetalhe.aberto_em).toLocaleDateString("pt-BR")}${openDetalhe.fechado_em ? ` — ${new Date(openDetalhe.fechado_em).toLocaleDateString("pt-BR")}` : ""}`,
                        openDetalhe.user_nome ?? undefined,
                      )
                    }
                    disabled={detalheMovs.length === 0}
                  >
                    <Printer className="h-4 w-4 mr-1" /> Relatório
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
            // min-w-0: DialogContent é um grid, e item de grid tem min-width
            // auto — sem isto o conteúdo largo empurra a largura do diálogo e
            // acaba cortado, porque ele só rola na vertical.
            <div className="space-y-5 min-w-0">
              {(() => {
                const tot = { recebimento: 0, sangria: 0, estorno: 0 };
                let qtdReceb = 0;
                let qtdEstornoReceb = 0;
                detalheMovs.forEach((m) => {
                  const v = Number(m.valor || 0);
                  if (m.tipo === "recebimento") {
                    tot.recebimento += v;
                    qtdReceb++;
                  } else if (m.tipo === "sangria") tot.sangria += v;
                  else if (m.tipo === "estorno") {
                    tot.estorno += v;
                    qtdEstornoReceb++;
                  }
                  if (
                    m.tipo !== "estorno" &&
                    (m.descricao ?? "").toLowerCase().includes("estorno")
                  ) {
                    tot.estorno += v;
                    qtdEstornoReceb++;
                  }
                });
                // Recebimentos líquidos: o estorno desconta do recebimento do
                // mesmo movimento, então nem o valor nem a contagem entram no
                // total exibido — a linha original continua na tabela como
                // rastro de auditoria.
                const recebLiquido = tot.recebimento - tot.estorno;
                const qtdRecebLiquido = Math.max(0, qtdReceb - qtdEstornoReceb);
                const diff = Number(openDetalhe.diferenca || 0);
                const media = qtdRecebLiquido > 0 ? recebLiquido / qtdRecebLiquido : 0;
                const sessaoAberta = openDetalhe.status !== "fechado";
                // Saldo líquido em tempo real da sessão: abertura + recebimentos
                // + suprimentos − sangrias − despesas − estornos. Usa TIPO_SINAL
                // sobre todos os movimentos carregados (verDetalhe busca a sessão
                // inteira, sem paginar), então bate com a tabela abaixo.
                //
                // Numa sessão aberta as colunas valor_fechamento_* ainda estão
                // nulas no banco — elas só são gravadas no fechamento. Ler o
                // "Calculado" direto dali fazia a barra nascer em R$ 0,00 mesmo
                // com recebimentos na tela. Sessão fechada continua mostrando o
                // valor gravado, que é o registro de auditoria daquele
                // fechamento e não deve ser recalculado.
                const saldoLiquido = saldoDeMovimentos(detalheMovs);
                const cards = [
                  {
                    key: "abertura",
                    label: "Abertura",
                    valor: fmt(openDetalhe.valor_abertura),
                    cls: "text-slate-700 dark:text-slate-200",
                  },
                  {
                    key: "recebimentos",
                    label: "Recebimentos",
                    valor: fmt(recebLiquido),
                    cls: "text-emerald-700 dark:text-emerald-400",
                    nota: `${qtdRecebLiquido} lançamento${qtdRecebLiquido === 1 ? "" : "s"}${
                      qtdEstornoReceb > 0
                        ? ` · ${qtdEstornoReceb} estornado${qtdEstornoReceb === 1 ? "" : "s"}`
                        : ""
                    }`,
                  },
                  {
                    key: "sangrias",
                    label: "Sangrias",
                    valor: tot.sangria > 0.005 ? `- ${fmt(tot.sangria)}` : fmt(0),
                    cls: tot.sangria > 0.005 ? "text-rose-700 dark:text-rose-400" : "",
                  },
                  {
                    key: "media",
                    label: "Média / atendimento",
                    valor: fmt(media),
                    cls: "text-slate-700 dark:text-slate-200",
                    nota: `${qtdRecebLiquido} atendimento${qtdRecebLiquido === 1 ? "" : "s"}`,
                  },
                  {
                    key: "estornos",
                    label: "Estornos",
                    valor: tot.estorno > 0.005 ? `- ${fmt(tot.estorno)}` : fmt(0),
                    cls: tot.estorno > 0.005 ? "text-rose-700 dark:text-rose-400" : "",
                  },
                ];
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                      {cards.map((c) => (
                        <div
                          key={c.key}
                          className="rounded-lg border bg-card shadow-sm p-3.5 space-y-1 min-w-0"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {c.label}
                          </p>
                          <p className={`text-base font-bold tabular-nums ${c.cls}`}>{c.valor}</p>
                          {c.nota && <p className="text-[11px] text-muted-foreground">{c.nota}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/40 px-4 py-3.5">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {sessaoAberta ? "Saldo atual (em tempo real)" : "Calculado"}
                          </p>
                          <p className="text-lg font-bold tabular-nums">
                            {fmt(
                              sessaoAberta
                                ? saldoLiquido
                                : Number(openDetalhe.valor_fechamento_calculado || 0),
                            )}
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Informado
                          </p>
                          <p className="text-lg font-bold tabular-nums">
                            {sessaoAberta ? "—" : fmt(openDetalhe.valor_fechamento_informado)}
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Diferença
                          </p>
                          <p
                            className={`text-lg font-bold tabular-nums ${
                              sessaoAberta
                                ? ""
                                : diff < 0
                                  ? "text-rose-600"
                                  : diff > 0
                                    ? "text-amber-600"
                                    : ""
                            }`}
                          >
                            {sessaoAberta ? "—" : fmt(diff)}
                          </p>
                        </div>
                      </div>
                      {sessaoAberta && (
                        <p className="text-[11px] text-muted-foreground mt-2.5">
                          Sessão em andamento: nada foi conferido ainda, então Informado e Diferença
                          só existem depois do fechamento.
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
              {/* Sem div extra em volta: a própria Table já é o contêiner de
                  rolagem nos dois eixos (padrão global de UI). Aninhar outro
                  anulava a rolagem horizontal e a coluna Valor ficava cortada. */}
              <Table containerClassName="max-h-[400px] rounded-lg border">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead className="text-right tabular-nums">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalheMovs.flatMap((m) => {
                    const bucket = bucketDeMov(m);
                    const partes = bucket === "misto" ? partesDoMov(m) : {};
                    const entradas = Object.entries(partes).filter(
                      ([, v]) => (v ?? 0) > 0.005,
                    ) as Array<[FormaBucket, number]>;
                    if (bucket === "misto" && entradas.length > 0) {
                      return entradas.map(([k, v], idx) => (
                        <TableRow key={`${m.id}-${k}`}>
                          <TableCell className="whitespace-nowrap">
                            {idx === 0 ? new Date(m.created_at).toLocaleDateString("pt-BR") : ""}
                          </TableCell>
                          <TableCell>
                            {idx === 0
                              ? new Date(m.created_at).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </TableCell>
                          <TableCell>
                            {idx === 0 ? (
                              <Badge variant="outline" className={TIPO_CLASS_SUAVE[m.tipo]}>
                                {TIPO_LABEL[m.tipo]}
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {idx === 0 ? (
                              m.descricao || "—"
                            ) : (
                              <span className="text-muted-foreground text-xs pl-2">↳ parcela</span>
                            )}
                          </TableCell>
                          <TableCell>{FORMA_LABEL[k] ?? k}</TableCell>
                          <TableCell className="text-xs uppercase">
                            {idx === 0 ? usuarioNomeFor(m) : ""}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-medium whitespace-nowrap ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}
                          >
                            {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                            {fmt(v)}
                          </TableCell>
                        </TableRow>
                      ));
                    }
                    return [
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
                          <Badge variant="outline" className={TIPO_CLASS_SUAVE[m.tipo]}>
                            {TIPO_LABEL[m.tipo]}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.descricao || "—"}</TableCell>
                        <TableCell>
                          <FormaCellEditavel m={m} />
                        </TableCell>
                        <TableCell className="text-xs uppercase">{usuarioNomeFor(m)}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium whitespace-nowrap ${TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : ""}`}
                        >
                          {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                          {fmt(m.valor)}
                        </TableCell>
                      </TableRow>,
                    ];
                  })}
                </TableBody>
              </Table>
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
        caixaMovimentoId={estornoFor?.tipo === "sangria" ? estornoFor.id : null}
        pacienteNome={(() => {
          if (estornoFor?.tipo === "sangria") return null;
          const d = estornoFor?.descricao ?? "";
          // Formato esperado: "NOME PACIENTE — PROCEDIMENTO"
          const idx = d.indexOf("—");
          return idx > 0 ? d.slice(0, idx).trim() : null;
        })()}
        onCreated={() => {
          void reloadEstornosPendentes();
        }}
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
                        return m.tipo === "sangria" || m.tipo === "despesa" || m.tipo === "estorno";
                      return true;
                    })
                    .flatMap((m) => {
                      const bucket = bucketDeMov(m);
                      const partes = bucket === "misto" ? partesDoMov(m) : {};
                      const entradas = Object.entries(partes).filter(
                        ([, v]) => (v ?? 0) > 0.005,
                      ) as Array<[FormaBucket, number]>;
                      if (bucket === "misto" && entradas.length > 0) {
                        return entradas.map(([k, v], idx) => (
                          <TableRow key={`${m.id}-${k}`}>
                            <TableCell className="whitespace-nowrap">
                              {idx === 0 ? fmtDT(m.created_at) : ""}
                            </TableCell>
                            <TableCell>
                              {idx === 0 ? (
                                <Badge variant="outline" className={TIPO_CLASS[m.tipo]}>
                                  {TIPO_LABEL[m.tipo]}
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {idx === 0 ? (
                                (m.descricao ?? "—")
                              ) : (
                                <span className="text-muted-foreground text-xs pl-2">
                                  ↳ parcela
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{FORMA_LABEL[k] ?? k}</TableCell>
                            <TableCell
                              className={`text-right font-semibold ${TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : ""}`}
                            >
                              {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                              {fmt(v)}
                            </TableCell>
                          </TableRow>
                        ));
                      }
                      return [
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap">{fmtDT(m.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={TIPO_CLASS[m.tipo]}>
                              {TIPO_LABEL[m.tipo]}
                            </Badge>
                          </TableCell>
                          <TableCell>{m.descricao ?? "—"}</TableCell>
                          <TableCell>
                            <FormaCellEditavel m={m} />
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${TIPO_SINAL[m.tipo] > 0 ? "text-emerald-600" : TIPO_SINAL[m.tipo] < 0 ? "text-rose-600" : ""}`}
                          >
                            {TIPO_SINAL[m.tipo] < 0 ? "-" : ""}
                            {fmt(m.valor)}
                          </TableCell>
                        </TableRow>,
                      ];
                    })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo para dados do cartão (crédito/débito) ao editar a Forma inline. */}
      <Dialog
        open={!!cartaoEditFor}
        onOpenChange={(v) => {
          if (!v) setCartaoEditFor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {cartaoEditFor?.forma === "cartao_credito"
                ? "Dados do cartão de crédito"
                : "Dados do cartão de débito"}
            </DialogTitle>
            <DialogDescription>
              Informe os dados da transação no cartão. Eles ficam vinculados ao lançamento
              financeiro.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Bandeira</Label>
              <Select
                value={cartaoEdit.bandeira}
                onValueChange={(v) => setCartaoEdit((s) => ({ ...s, bandeira: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a bandeira" />
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
            {cartaoEditFor?.forma === "cartao_credito" && (
              <div className="grid gap-1.5">
                <Label>Parcelamento</Label>
                <Select
                  value={cartaoEdit.parcelas}
                  onValueChange={(v) => setCartaoEdit((s) => ({ ...s, parcelas: v }))}
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
            <div className="grid gap-1.5">
              <Label>Data da transação</Label>
              <Input
                type="date"
                value={cartaoEdit.data}
                onChange={(e) => setCartaoEdit((s) => ({ ...s, data: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Número de autorização</Label>
              <Input
                value={cartaoEdit.autorizacao}
                onChange={(e) => setCartaoEdit((s) => ({ ...s, autorizacao: e.target.value }))}
                placeholder="Ex.: 123456"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Valor total líquido (R$)</Label>
              <CurrencyInput
                value={cartaoEdit.valorLiquido}
                onChange={(v) => setCartaoEdit((s) => ({ ...s, valorLiquido: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCartaoEditFor(null)}
              disabled={salvandoCartao}
            >
              Cancelar
            </Button>
            <Button onClick={() => void confirmarCartaoEdit()} disabled={salvandoCartao}>
              {salvandoCartao ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
