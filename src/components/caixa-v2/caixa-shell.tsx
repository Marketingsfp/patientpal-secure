import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  PlusCircle, MinusCircle, ArrowDownToLine, ArrowUpFromLine, Printer, FileDown,
  Lock, Unlock, ChevronRight, Users, Wallet, AlertTriangle, HandCoins,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ListShell, VirtualList, QuickFilters, type StatusTab } from "@/components/list-shell";
import { brl } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { PainelResumo, type ResumoData } from "./painel-resumo";
import { FilaCard, type FilaCardData, type StatusFila } from "./fila-card";
import { MiniTimeline, buildTimeline } from "./mini-timeline";
import { detectarAlertas, type AlertaBadge } from "./alertas-fila";
import { KpiBar, type KpiData } from "./kpi-bar";
import { useCaixaShortcuts } from "./atalhos";

type MovTipo = "abertura" | "sangria" | "suprimento" | "recebimento" | "despesa" | "fechamento";
interface Sessao {
  id: string; clinica_id: string; user_id: string; user_nome: string | null;
  aberto_em: string; valor_abertura: number;
  fechado_em: string | null; status: "aberto" | "fechado";
}
interface Mov {
  id: string; sessao_id: string; user_id: string; tipo: MovTipo;
  valor: number; descricao: string | null; forma_pagamento: string | null;
  created_at: string; lancamento_id: string | null;
}
interface FilaItem {
  id: string; paciente_id: string | null; paciente_nome: string;
  procedimento: string | null; inicio: string; medico_nome: string | null;
  valor: number; valor_cartao: number; ja_pago: boolean;
}

type TabKey = "hoje" | "sessao" | "todos";
type PeriodoKey = "hoje" | "7d" | "30d";

const TIPO_LABEL: Record<MovTipo, string> = {
  abertura: "Abertura", suprimento: "Suprimento", recebimento: "Recebimento",
  sangria: "Sangria", despesa: "Despesa", fechamento: "Fechamento",
};
const TIPO_CLASS: Record<MovTipo, string> = {
  abertura: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  suprimento: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  recebimento: "bg-green-500/10 text-green-700 dark:text-green-300",
  sangria: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  despesa: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  fechamento: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};
const TIPO_SINAL: Record<MovTipo, 1 | -1 | 0> = {
  abertura: 1, suprimento: 1, recebimento: 1, sangria: -1, despesa: -1, fechamento: 0,
};

const TIPO_OPTS = [
  { value: "recebimento", label: "Recebimento" },
  { value: "despesa", label: "Despesa" },
  { value: "sangria", label: "Sangria" },
  { value: "suprimento", label: "Suprimento" },
  { value: "abertura", label: "Abertura/Fech." },
] as const;

const FORMA_OPTS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "cartao", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
] as const;

const PERIODO_OPTS: ReadonlyArray<{ value: PeriodoKey; label: string }> = [
  { value: "hoje", label: "Hoje" }, { value: "7d", label: "7 dias" }, { value: "30d", label: "30 dias" },
];

const BATCH = 40;
const FIRST_BATCH = 60;

function parsePrefixado(q: string): { field: "paciente" | "recibo" | "valor" | "data" | null; term: string } {
  const m = q.match(/^([prvd]):(.*)$/i);
  if (!m) return { field: null, term: q };
  const map = { p: "paciente", r: "recibo", v: "valor", d: "data" } as const;
  return { field: map[m[1].toLowerCase() as "p" | "r" | "v" | "d"], term: m[2].trim() };
}

function agoraTexto(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

export function CaixaShellV2({ compactPref, onToggleCompact }: {
  compactPref: boolean; onToggleCompact: (v: boolean) => void;
}) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [sessaoLoading, setSessaoLoading] = useState(true);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [movsLoading, setMovsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [novosCount, setNovosCount] = useState(0);

  const [tab, setTab] = useState<TabKey>("hoje");
  const [search, setSearch] = useState("");
  const [tipos, setTipos] = useState<string[]>([]);
  const [formas, setFormas] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState<PeriodoKey>("7d");
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [filaLoading, setFilaLoading] = useState(true);

  const compact = compactPref;

  // Carrega sessão aberta do usuário
  const loadSessao = useCallback(async () => {
    if (!clinicaAtual || !user) return;
    setSessaoLoading(true);
    const { data } = await supabase.from("caixa_sessoes")
      .select("id, clinica_id, user_id, user_nome, aberto_em, valor_abertura, fechado_em, status")
      .eq("clinica_id", clinicaAtual.clinica_id).eq("user_id", user.id)
      .eq("status", "aberto").order("aberto_em", { ascending: false }).limit(1).maybeSingle();
    setSessao((data as Sessao | null) ?? null);
    setSessaoLoading(false);
  }, [clinicaAtual, user]);

  // Default: se houver sessão aberta, aba "sessao"
  useEffect(() => { void loadSessao(); }, [loadSessao]);
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (defaultedRef.current || sessaoLoading) return;
    defaultedRef.current = true;
    if (sessao) setTab("sessao");
  }, [sessao, sessaoLoading]);

  // Query builder
  const buildRange = useCallback((): { from: string; to: string } => {
    const now = new Date();
    const end = now.toISOString();
    let start = new Date(now); start.setHours(0, 0, 0, 0);
    if (tab === "todos") {
      const days = periodo === "hoje" ? 0 : periodo === "7d" ? 7 : 30;
      start = new Date(now.getTime() - days * 86400000);
    }
    return { from: start.toISOString(), to: end };
  }, [tab, periodo]);

  const applyFilters = useCallback((qb: any): any => {
    let q: any = qb;
    q = q.eq("clinica_id", clinicaAtual!.clinica_id);
    if (tab === "sessao" && sessao) q = q.eq("sessao_id", sessao.id);
    else {
      const { from, to } = buildRange();
      q = q.gte("created_at", from).lte("created_at", to);
    }
    if (tipos.length) q = q.in("tipo", tipos);
    if (formas.length) {
      if (formas.includes("cartao")) {
        const others = formas.filter((f) => f !== "cartao");
        q = q.or(`forma_pagamento.in.(${[...others, "credito", "debito"].map((f) => `"${f}"`).join(",")})`);
      } else {
        q = q.in("forma_pagamento", formas);
      }
    }
    const { field, term } = parsePrefixado(search);
    if (term) {
      if (field === "valor") {
        const n = Number(term.replace(",", "."));
        if (!isNaN(n)) q = q.eq("valor", n);
      } else if (field === "recibo") {
        q = q.ilike("id", `%${term}%`);
      } else {
        q = q.ilike("descricao", `%${term}%`);
      }
    }
    return q;
  }, [clinicaAtual, tab, sessao, tipos, formas, search, buildRange]);

  // Carrega movimentos (primeiro batch)
  const loadMovs = useCallback(async () => {
    if (!clinicaAtual) return;
    if (tab === "sessao" && !sessao) { setMovs([]); setMovsLoading(false); setHasMore(false); return; }
    setMovsLoading(true);
    setNovosCount(0);
    let q = supabase.from("caixa_movimentos")
      .select("id, sessao_id, user_id, tipo, valor, descricao, forma_pagamento, created_at, lancamento_id, clinica_id");
    q = applyFilters(q);
    q = q.order("created_at", { ascending: false }).range(0, FIRST_BATCH - 1);
    const { data, error } = await q;
    if (error) { toast.error("Erro ao carregar movimentos"); setMovs([]); setHasMore(false); }
    else {
      const rows = (data ?? []) as Mov[];
      setMovs(rows);
      setHasMore(rows.length === FIRST_BATCH);
    }
    setMovsLoading(false);
  }, [clinicaAtual, tab, sessao, applyFilters]);

  useEffect(() => { void loadMovs(); }, [loadMovs]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !clinicaAtual) return;
    setLoadingMore(true);
    let q = supabase.from("caixa_movimentos")
      .select("id, sessao_id, user_id, tipo, valor, descricao, forma_pagamento, created_at, lancamento_id, clinica_id");
    q = applyFilters(q);
    q = q.order("created_at", { ascending: false }).range(movs.length, movs.length + BATCH - 1);
    const { data } = await q;
    const rows = (data ?? []) as Mov[];
    setMovs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      return [...cur, ...rows.filter((r) => !seen.has(r.id))];
    });
    setHasMore(rows.length === BATCH);
    setLoadingMore(false);
  }, [loadingMore, hasMore, clinicaAtual, applyFilters, movs.length]);

  // Realtime: novo mov -> incrementa badge
  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase.channel(`caixa-v2-mov-${clinicaAtual.clinica_id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "caixa_movimentos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        () => { setNovosCount((n) => n + 1); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clinicaAtual]);

  // Fila do caixa (RPC existente, extremamente rápida)
  const loadFila = useCallback(async () => {
    if (!clinicaAtual) return;
    setFilaLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc("fila_caixa_hoje", {
      _clinica_id: clinicaAtual.clinica_id, _data: hoje,
    });
    if (error) { setFila([]); setFilaLoading(false); return; }
    const rows = (data ?? []) as Array<Omit<FilaItem, "valor" | "valor_cartao"> & { valor: number | string | null; valor_cartao: number | string | null; desconto_origem: string | null }>;
    setFila(rows.map((r) => ({
      id: r.id, paciente_id: r.paciente_id,
      paciente_nome: r.paciente_nome,
      procedimento: r.desconto_origem ? `${r.procedimento} (${r.desconto_origem})` : r.procedimento,
      inicio: r.inicio, medico_nome: r.medico_nome,
      valor: Number(r.valor ?? 0), valor_cartao: Number(r.valor_cartao ?? 0),
      ja_pago: r.ja_pago,
    })));
    setFilaLoading(false);
  }, [clinicaAtual]);

  useEffect(() => { void loadFila(); }, [loadFila]);
  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase.channel(`caixa-v2-fila-${clinicaAtual.clinica_id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "agendamentos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        () => { void loadFila(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clinicaAtual, loadFila]);

  // Toggle compacto por atalho Ctrl+Shift+C
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault(); onToggleCompact(!compact);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [compact, onToggleCompact]);

  const filaPend = useMemo(() => fila.filter((f) => !f.ja_pago), [fila]);

  // ===== Resumo agregado (client-side)
  const resumoData = useMemo<ResumoData>(() => {
    const recebimentos = movs.filter((m) => m.tipo === "recebimento");
    const somaForma = (forma: string) =>
      recebimentos
        .filter((m) => (m.forma_pagamento ?? "").toLowerCase().includes(forma))
        .reduce((s, m) => s + Number(m.valor || 0), 0);
    const recebidoTotal = recebimentos.reduce((s, m) => s + Number(m.valor || 0), 0);
    const recebidoSessao = sessao
      ? recebimentos.filter((m) => m.sessao_id === sessao.id).reduce((s, m) => s + Number(m.valor || 0), 0)
      : 0;
    const saldo = movs.reduce((s, m) => s + Number(m.valor || 0) * (TIPO_SINAL[m.tipo] || 0), 0);
    const particular = fila.filter((f) => !f.valor_cartao).reduce((s, f) => s + f.valor, 0);
    const associado = fila.filter((f) => f.valor_cartao > 0).reduce((s, f) => s + f.valor_cartao, 0);
    return {
      saldo, recebidoHoje: recebidoTotal, recebidoSessao,
      particular, associado,
      dinheiro: somaForma("dinheiro"),
      pix: somaForma("pix"),
      cartao: somaForma("cart") + somaForma("credito") + somaForma("debito"),
      pendentesFila: filaPend.length,
      aguardandoPagamento: filaPend.filter((f) => !f.ja_pago).length,
    };
  }, [movs, fila, filaPend, sessao]);

  // ===== Fila → cards (status + alertas)
  const filaCards = useMemo<FilaCardData[]>(() => {
    return filaPend.map((f) => {
      const status: StatusFila = f.ja_pago ? "paid" : "waiting";
      const alertas: AlertaBadge[] = detectarAlertas({
        inicio: f.inicio, ja_pago: f.ja_pago,
        // dados extras não presentes na RPC; futuras fases podem enriquecer
        paciente_cpf: null, paciente_endereco: null,
      });
      const tipoCobranca: FilaCardData["tipoCobranca"] =
        f.valor_cartao > 0 ? "Associado" : "Particular";
      return {
        id: f.id,
        pacienteNome: f.paciente_nome,
        pacienteIdade: null,
        procedimento: f.procedimento,
        medicoNome: f.medico_nome,
        inicio: f.inicio,
        valor: f.valor + f.valor_cartao,
        tipoCobranca, status, alertas,
      };
    });
  }, [filaPend]);

  const totalAlertas = useMemo(
    () => filaCards.reduce((n, c) => n + c.alertas.length, 0),
    [filaCards],
  );

  // ===== Drawer da Mini Timeline
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const drawerItem = useMemo(
    () => filaCards.find((f) => f.id === drawerId) ?? null,
    [drawerId, filaCards],
  );

  // ===== KPIs derivados
  const kpiData = useMemo<KpiData>(() => {
    const recebimentos = movs.filter((m) => m.tipo === "recebimento");
    const receitaHoje = recebimentos.reduce((s, m) => s + Number(m.valor || 0), 0);
    const receitaSessao = sessao
      ? recebimentos.filter((m) => m.sessao_id === sessao.id).reduce((s, m) => s + Number(m.valor || 0), 0)
      : 0;
    return {
      tempoMedioPagamentoMin: null,
      maiorFila: null,
      tempoMedioCaixaMin: null,
      receitaSessao, receitaHoje,
      atendimentos: recebimentos.length,
    };
  }, [movs, sessao]);

  const tabs: ReadonlyArray<StatusTab<TabKey>> = [
    { value: "hoje", label: "Hoje" },
    { value: "sessao", label: "Sessão atual", count: sessao ? undefined : 0 },
    { value: "todos", label: "Todos" },
  ];

  // ===== Actions (delegam à tela clássica; não altera regras)
  const goCaixa = (msg?: string) => {
    if (msg) toast.info(msg);
    window.location.href = "/app/caixa";
  };

  // Ação primária "Receber" — 1 clique. Se houver único item pendente,
  // navega direto para /app/caixa com hint via query; caso contrário abre
  // seleção lá. A gravação/regra continua no clássico.
  const receberFila = useCallback((filaId?: string) => {
    const id = filaId ?? filaCards[0]?.id;
    if (!id) { toast.info("Nenhum paciente na fila."); return; }
    window.location.href = `/app/caixa?receber=${encodeURIComponent(id)}`;
  }, [filaCards]);

  // Atalhos F2/F3/F4/Esc
  useCaixaShortcuts({
    onReceber: () => receberFila(),
    onImprimir: () => goCaixa("Impressão de recibo abre no caixa clássico"),
    onDespesa: () => goCaixa("Nova despesa abre no caixa clássico"),
    onEscape: () => setDrawerId(null),
  });

  // Layout
  const listEl = (
    <ListShell<TabKey>
      title={<div className="text-sm text-muted-foreground">
        {tab === "sessao" && sessao ? `Sessão #${sessao.id.slice(0, 8)}` : tab === "hoje" ? "Movimentos de hoje" : `Últimos ${periodo === "hoje" ? "hoje" : periodo}`}
      </div>}
      actions={novosCount > 0 ? (
        <Button size="sm" variant="secondary" onClick={() => { setNovosCount(0); void loadMovs(); }}>
          {novosCount} novo{novosCount > 1 ? "s" : ""} — atualizar
        </Button>
      ) : null}
      searchValue={search} onSearchChange={setSearch}
      searchPlaceholder="Buscar movimento — p: paciente, r: recibo, v: valor, d: data…"
      tabs={tabs} tabValue={tab} onTabChange={setTab}
      chips={
        <div className="flex flex-col gap-2">
          <QuickFilters options={TIPO_OPTS as any} value={tipos as any} onChange={(v) => setTipos(v as any)} multi ariaLabel="Tipo" />
          <QuickFilters options={FORMA_OPTS as any} value={formas as any} onChange={(v) => setFormas(v as any)} multi ariaLabel="Forma de pagamento" />
          {tab === "todos" && (
            <QuickFilters options={PERIODO_OPTS as any} value={[periodo] as any} onChange={(v) => setPeriodo(((v[0] as any) ?? "7d"))} ariaLabel="Período" />
          )}
        </div>
      }
      loading={movsLoading}
      isEmpty={!movsLoading && movs.length === 0}
      empty={<div>Nenhum movimento encontrado.</div>}
    >
      <VirtualList<Mov>
        items={movs}
        estimateSize={compact ? 32 : 40}
        getKey={(m) => m.id}
        onEndReached={loadMore}
        renderItem={(m) => {
          const sinal = TIPO_SINAL[m.tipo];
          return (
            <div className={cn(
              "grid items-center gap-3 border-b border-border/50 px-3",
              compact ? "h-8 text-[13px]" : "h-10 text-sm",
              compact ? "grid-cols-[52px_100px_1fr_90px]" : "grid-cols-[60px_120px_1fr_100px_100px]",
            )}>
              <span className="tabular-nums text-muted-foreground">
                {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium w-fit", TIPO_CLASS[m.tipo])}>
                {TIPO_LABEL[m.tipo]}
              </span>
              <span className="truncate">{m.descricao ?? "—"}</span>
              {!compact && (
                <span className="text-xs text-muted-foreground truncate">{m.forma_pagamento ?? "—"}</span>
              )}
              <span className={cn("tabular-nums text-right font-medium",
                sinal > 0 ? "text-emerald-600 dark:text-emerald-400" : sinal < 0 ? "text-rose-600 dark:text-rose-400" : "")}>
                {sinal < 0 ? "-" : sinal > 0 ? "+" : ""}{brl(Number(m.valor) || 0)}
              </span>
            </div>
          );
        }}
      />
      {loadingMore && <div className="p-2 text-center text-xs text-muted-foreground">Carregando mais…</div>}
    </ListShell>
  );

  const filaEl = (
    <div className="flex flex-col h-full min-h-0 rounded-lg border border-border bg-card">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" aria-hidden />
          <div className="font-semibold text-sm">Fila do caixa</div>
          <Badge variant="secondary">{filaPend.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">Hoje</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {filaLoading ? (
          <div className="p-3 text-sm text-muted-foreground">Carregando…</div>
        ) : filaPend.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Nenhum paciente aguardando.</div>
        ) : (
          <VirtualList<FilaItem>
            items={filaPend}
            estimateSize={68}
            getKey={(f) => f.id}
            renderItem={(f) => (
              <div className="border-b border-border/50 p-2.5 hover:bg-accent/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.paciente_nome}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {new Date(f.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {f.medico_nome ? ` · ${f.medico_nome}` : ""}
                    </div>
                    {f.procedimento && (
                      <div className="truncate text-xs text-muted-foreground">{f.procedimento}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{brl(f.valor)}</div>
                  </div>
                </div>
                <div className="mt-1.5">
                  <Button
                    size="sm" className="w-full h-8 gap-1.5"
                    onClick={() => goCaixa("Abrindo cobrança na tela do Caixa…")}
                    data-testid={`fila-receber-${f.id}`}
                  >
                    <HandCoins className="h-4 w-4" /> Receber pagamento
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );

  // Topbar
  const topbar = (
    <div className="flex flex-col gap-2 mb-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Wallet className="h-5 w-5 text-primary" aria-hidden />
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight">Caixa</div>
            <div className="text-xs text-muted-foreground truncate">
              {sessaoLoading ? "…" : sessao
                ? `Sessão aberta há ${agoraTexto(sessao.aberto_em)} · abertura ${brl(sessao.valor_abertura)}`
                : "Nenhuma sessão aberta"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onToggleCompact(!compact)} data-testid="toggle-compact">
            {compact ? "Modo normal" : "Modo compacto"}
            <span className="ml-2 text-[10px] text-muted-foreground hidden sm:inline">Ctrl+Shift+C</span>
          </Button>
          {isMobile && (
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" variant="secondary" data-testid="fila-sheet-trigger">
                  <Users className="h-4 w-4 mr-1" /> Fila ({filaPend.length})
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[92vw] sm:max-w-md p-0 flex flex-col">
                <SheetHeader className="p-3 border-b"><SheetTitle>Fila do caixa</SheetTitle></SheetHeader>
                <div className="flex-1 min-h-0 p-2">{filaEl}</div>
              </SheetContent>
            </Sheet>
          )}
          {!sessao ? (
            <Button size="sm" onClick={() => goCaixa("Abrir caixa na tela clássica")} data-testid="btn-abrir">
              <Unlock className="h-4 w-4" /> Abrir caixa
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => goCaixa("Fechar caixa na tela clássica")} data-testid="btn-fechar">
              <Lock className="h-4 w-4" /> Fechar caixa
            </Button>
          )}
        </div>
      </div>
      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => goCaixa()} data-testid="quick-receber">
          <PlusCircle className="h-4 w-4" /> Receber
        </Button>
        <Button size="sm" variant="outline" onClick={() => goCaixa()}>
          <MinusCircle className="h-4 w-4" /> Despesa
        </Button>
        <Button size="sm" variant="outline" onClick={() => goCaixa()}>
          <ArrowDownToLine className="h-4 w-4" /> Suprimento
        </Button>
        <Button size="sm" variant="outline" onClick={() => goCaixa()}>
          <ArrowUpFromLine className="h-4 w-4" /> Sangria
        </Button>
        <Button size="sm" variant="ghost" onClick={() => goCaixa()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
        <Button size="sm" variant="ghost" onClick={() => goCaixa()}>
          <FileDown className="h-4 w-4" /> Exportar
        </Button>
        <Link to="/app/caixa" className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-center">
          Ir para o caixa clássico <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 p-3 md:p-4">
      {topbar}
      <div className={cn("flex-1 min-h-0 grid gap-3",
        isMobile ? "grid-cols-1" : "grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]",
      )}>
        <div className="min-h-0">{listEl}</div>
        {!isMobile && <div className="min-h-0">{filaEl}</div>}
      </div>
    </div>
  );
}