import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Info, Plus, Rows3, LayoutList, ChevronLeft, ChevronRight,
  ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, Printer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useUserPref } from "@/hooks/use-user-pref";
import { useAuth } from "@/hooks/use-auth";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ListShell, VirtualList, QuickFilters,
  type StatusTab, type QuickFilterOption,
} from "@/components/list-shell";
import { ClienteCard } from "./cliente-card";
import { exportarPacientesCSV, exportarPacientesPDF } from "./exportar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClienteDrawer } from "./cliente-drawer";
import { ClientesKpiBar, type ClientesKpi } from "./kpi-bar";
import { ResumoBar } from "./resumo-bar";
import { useClientesKpis } from "./use-kpis";
import {
  cadastroIncompleto, isAniversarianteHoje, isNovo30d,
  marcarDuplicados, pagadorLabel, semCpf, semTelefone,
  type PacienteV2,
} from "./status-utils";

type TabV = "todos" | "ativos" | "inativos" | "incompletos" | "duplicados";
type ChipV =
  | "particular" | "associado" | "cartao"
  | "aniv" | "novos30" | "sem_tel" | "sem_cpf";
type ResumoMode = "none" | "aniv" | "inativos";
type CampoBusca = "todos" | "nome" | "id" | "convenio";
type OrdemBusca = "relevancia" | "nome" | "cadastro";
type DirOrdem = "asc" | "desc";

const ORDEM_OPTS: ReadonlyArray<{ value: OrdemBusca; label: string; title: string }> = [
  { value: "relevancia", label: "Relevância", title: "Ordem de relevância da busca" },
  { value: "nome", label: "Nome", title: "Ordenar por nome" },
  { value: "cadastro", label: "Cadastro", title: "Ordenar por data de cadastro" },
];

const CAMPO_OPTS: ReadonlyArray<{ value: CampoBusca; label: string }> = [
  { value: "todos", label: "Todos os campos" },
  { value: "nome", label: "Nome" },
  { value: "id", label: "ID / Prontuário" },
  { value: "convenio", label: "Convênio" },
];

const TAB_OPTS: ReadonlyArray<StatusTab<TabV>> = [
  { value: "todos", label: "Todos" },
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
  { value: "incompletos", label: "Cadastro incompleto" },
  { value: "duplicados", label: "Possíveis duplicidades" },
];

const CHIP_OPTS: ReadonlyArray<QuickFilterOption<ChipV>> = [
  { value: "particular", label: "Particular" },
  { value: "associado", label: "Associado" },
  { value: "cartao", label: "Cartão de Benefícios" },
  { value: "aniv", label: "Aniversariantes hoje" },
  { value: "novos30", label: "Novos 30 dias" },
  { value: "sem_tel", label: "Sem telefone" },
  { value: "sem_cpf", label: "Sem CPF" },
];

interface Props {
  compactPref: boolean;
  onToggleCompact: (v: boolean) => void;
}

/**
 * Clientes V2 — busca SERVER-SIDE via RPC `buscar_pacientes_global`.
 * Sem carregar milhares no cliente: lista inicial mostra apenas os
 * cadastros mais recentes; qualquer busca real (>= 2 caracteres) vai
 * ao banco. Filtros/chips operam apenas sobre o resultado visível.
 */
export function ClientesShellV2({ compactPref, onToggleCompact }: Props) {
  const { clinicaAtual, clinicaIds } = useClinica();
  const [rows, setRows] = useState<PacienteV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useUserPref<string>("clientes:q", "");
  const [tab, setTab] = useUserPref<TabV>("clientes:tab", "todos");
  const [chips, setChips] = useUserPref<ChipV[]>("clientes:chips", []);
  const [resumoMode, setResumoMode] = useUserPref<ResumoMode>("clientes:resumo", "none");
  const [drawer, setDrawer] = useState<PacienteV2 | null>(null);
  const [pageSize, setPageSize] = useUserPref<number>("clientes:page-size", 25);
  const [page, setPage] = useUserPref<number>("clientes:page", 1);
  const [campo, setCampo] = useUserPref<CampoBusca>("clientes:campo", "todos");
  const [convenio, setConvenio] = useUserPref<string>("clientes:convenio", "todos");
  const [ordem, setOrdem] = useUserPref<OrdemBusca>("clientes:ordem", "relevancia");
  const [dirOrdem, setDirOrdem] = useUserPref<DirOrdem>("clientes:ordem-dir", "asc");
  const [totalBase, setTotalBase] = useState<number | null>(null);
  const reqRef = useRef(0);

  const kpis = useClientesKpis(clinicaAtual?.clinica_id ?? null);

  const modoBusca = q.trim().length >= 2;
  const scope = useMemo(
    () => (clinicaIds.length ? clinicaIds : clinicaAtual ? [clinicaAtual.clinica_id] : []),
    [clinicaIds, clinicaAtual],
  );

  const loadRecentes = useCallback(async () => {
    if (!clinicaAtual || scope.length === 0) return;
    const myReq = ++reqRef.current;
    setLoading(true);
    const cols =
      "id, clinica_id, nome, cpf, telefone, telefone2, data_nascimento, email, ativo, codigo_prontuario, codigo_prontuario_anterior, numero_pasta, cidade, estado, foto_url, created_at";
    let query = supabase.from("pacientes").select(cols);
    query = scope.length === 1 ? query.eq("clinica_id", scope[0]) : query.in("clinica_id", scope);
    // Modos server-side leves (usam índices ou RPC dedicada).
    // Os demais filtros são aplicados client-side sobre os últimos 50.
    let mode: ResumoMode = resumoMode;
    if (mode === "none" && chips.includes("aniv")) mode = "aniv";
    if (mode === "aniv") {
      const { data, error } = await supabase.rpc("pacientes_aniversariantes_hoje", {
        _clinica_id: scope[0], _limite: 200,
      });
      if (myReq !== reqRef.current) return;
      if (error) { mostrarErro(error); setLoading(false); return; }
      setRows(marcarDuplicados((data ?? []) as PacienteV2[]));
      setLoading(false);
      return;
    }
    if (mode === "inativos") query = query.eq("ativo", false);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
    if (myReq !== reqRef.current) return;
    if (error) { mostrarErro(error); setLoading(false); return; }
    setTotalBase(null);
    setRows(marcarDuplicados((data ?? []) as PacienteV2[]));
    setLoading(false);
  }, [clinicaAtual, scope, resumoMode, chips]);

  const loadBusca = useCallback(async (termo: string) => {
    if (scope.length === 0) return;
    const myReq = ++reqRef.current;
    setLoading(true);
    const { data, error } = await supabase.rpc("buscar_pacientes_global", {
      _clinica_ids: scope,
      _termo: termo,
      _limite: 50,
    });
    if (myReq !== reqRef.current) return;
    if (error) { mostrarErro(error); setLoading(false); return; }
    const base = ((data ?? []) as unknown as PacienteV2[]).map((r) => ({
      ...r,
      ativo: true,
      cidade: null,
      estado: null,
      foto_url: null,
      created_at: "",
    })) as PacienteV2[];
    const ids = base.map((r) => r.id);
    if (ids.length > 0) {
      const { data: extra } = await supabase
        .from("pacientes")
        .select("id, ativo, cidade, estado, foto_url, telefone2, created_at")
        .in("id", ids);
      const byId = new Map<string, Partial<PacienteV2>>(
        (extra ?? []).map((e) => [e.id as string, e as Partial<PacienteV2>]),
      );
      for (const r of base) {
        const e = byId.get(r.id);
        if (e) Object.assign(r, e);
      }
    }
    if (myReq !== reqRef.current) return;
    setRows(marcarDuplicados(base));
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    if (modoBusca) void loadBusca(q.trim());
    else void loadRecentes();
  }, [modoBusca, q, loadBusca, loadRecentes]);

  const filtrados = useMemo(() => {
    let r = rows;
    const termo = q.trim().toLowerCase();
    if (termo && campo !== "todos") {
      r = r.filter((p) => {
        if (campo === "nome") return (p.nome ?? "").toLowerCase().includes(termo);
        if (campo === "id") {
          return [p.codigo_prontuario, p.codigo_prontuario_anterior, p.numero_pasta, p.id]
            .some((v) => String(v ?? "").toLowerCase().includes(termo));
        }
        return (p.associado_convenio ?? "").toLowerCase().includes(termo);
      });
    }
    if (convenio !== "todos") {
      r = convenio === "__particular__"
        ? r.filter((p) => !p.associado_convenio && !p.tem_cartao_beneficios)
        : r.filter((p) => (p.associado_convenio ?? "") === convenio);
    }
    if (tab === "ativos") r = r.filter((p) => p.ativo);
    else if (tab === "inativos") r = r.filter((p) => !p.ativo);
    else if (tab === "incompletos") r = r.filter(cadastroIncompleto);
    else if (tab === "duplicados") r = r.filter((p) => p.duplicado_hint);
    const tipos = chips.filter(
      (c): c is "particular" | "associado" | "cartao" =>
        c === "particular" || c === "associado" || c === "cartao",
    );
    if (tipos.length > 0) r = r.filter((p) => tipos.includes(pagadorLabel(p).tipo));
    if (chips.includes("aniv")) r = r.filter((p) => isAniversarianteHoje(p.data_nascimento));
    if (chips.includes("novos30")) r = r.filter(isNovo30d);
    if (chips.includes("sem_tel")) r = r.filter(semTelefone);
    if (chips.includes("sem_cpf")) r = r.filter(semCpf);
    return r;
  }, [rows, tab, chips, q, campo, convenio]);

  // Ordenação dos resultados. "Relevância" preserva a ordem devolvida pela busca.
  const ordenados = useMemo(() => {
    const posicao = new Map(rows.map((p, i) => [p.id, i]));
    const sinal = dirOrdem === "asc" ? 1 : -1;
    const arr = [...filtrados];
    arr.sort((a, b) => {
      if (ordem === "nome") {
        return sinal * (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR", { sensitivity: "base" });
      }
      if (ordem === "cadastro") {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return sinal * (ta - tb);
      }
      return sinal * ((posicao.get(a.id) ?? 0) - (posicao.get(b.id) ?? 0));
    });
    return arr;
  }, [filtrados, rows, ordem, dirOrdem]);

  const aplicarOrdem = (v: OrdemBusca) => {
    if (v === ordem) {
      setDirOrdem((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setOrdem(v);
    // Padrões úteis: nome A→Z, cadastro mais recente primeiro.
    setDirOrdem(v === "cadastro" ? "desc" : "asc");
  };

  const conveniosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const p of rows) if (p.associado_convenio) set.add(p.associado_convenio);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / pageSize));
  const paginaAtual = Math.min(page, totalPaginas);
  const visiveis = ordenados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);

  // Descrição dos filtros ativos, impressa no cabeçalho do PDF.
  const resumoExport = [
    q.trim() ? `busca “${q.trim()}”` : null,
    tab !== "todos" ? (TAB_OPTS.find((t) => t.value === tab)?.label ?? null) : null,
    convenio !== "todos"
      ? convenio === "__particular__" ? "Particular" : `Convênio ${convenio}`
      : null,
    chips.length ? `filtros: ${chips.join(", ")}` : null,
  ].filter(Boolean).join(" · ");

  // ---- Navegação por teclado nos resultados (roving tabindex) ----
  const listaRef = useRef<HTMLDivElement>(null);
  const [focoIdx, setFocoIdx] = useState(0);
  const [navTeclado, setNavTeclado] = useState(false);

  useEffect(() => { setFocoIdx(0); }, [paginaAtual, pageSize, q, campo, convenio, tab, chips, ordem, dirOrdem]);

  useEffect(() => {
    if (!navTeclado) return;
    const alvo = listaRef.current?.querySelector<HTMLElement>(`[data-cliente-idx="${focoIdx}"]`);
    if (alvo) {
      alvo.scrollIntoView({ block: "nearest" });
      alvo.focus({ preventScroll: true });
    }
  }, [focoIdx, navTeclado, visiveis.length]);

  const onListaKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const total = visiveis.length;
    if (total === 0) return;
    const mover = (next: number) => {
      e.preventDefault();
      setNavTeclado(true);
      setFocoIdx(Math.max(0, Math.min(total - 1, next)));
    };
    switch (e.key) {
      case "ArrowDown": return mover(focoIdx + 1);
      case "ArrowUp": return mover(focoIdx - 1);
      case "PageDown": return mover(focoIdx + 10);
      case "PageUp": return mover(focoIdx - 10);
      case "Home": return mover(0);
      case "End": return mover(total - 1);
      case "Enter": {
        const p = visiveis[focoIdx];
        if (!p) return;
        e.preventDefault();
        if (e.altKey) window.location.assign(`/app/clientes/${p.id}/editar`);
        else setDrawer(p);
        return;
      }
      default:
        return;
    }
  };

  // Só reseta a página depois que as preferências salvas terminarem de hidratar,
  // senão a página restaurada seria descartada ao carregar os filtros.
  const { user } = useAuth();
  const [prefsProntas, setPrefsProntas] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    const id = requestAnimationFrame(() => setPrefsProntas(true));
    return () => cancelAnimationFrame(id);
  }, [user?.id]);
  useEffect(() => {
    if (!prefsProntas) return;
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, campo, convenio, tab, chips, pageSize, prefsProntas]);

  const kpi: ClientesKpi = useMemo(() => {
    // (KPIs abaixo)
    let ativos = 0, inativos = 0, incompletos = 0, duplicados = 0;
    let associados = 0, cartao = 0, particular = 0;
    for (const p of filtrados) {
      if (p.ativo) ativos++; else inativos++;
      if (cadastroIncompleto(p)) incompletos++;
      if (p.duplicado_hint) duplicados++;
      const t = pagadorLabel(p).tipo;
      if (t === "associado") associados++;
      else if (t === "cartao") cartao++;
      else particular++;
    }
    return {
      visiveis: filtrados.length,
      ativos, inativos, incompletos, duplicados,
      associados, cartao, particular,
    };
  }, [filtrados]);

  const tabsWithCounts = TAB_OPTS.map((t) => ({
    ...t,
    count:
      t.value === "todos" ? rows.length
      : t.value === "ativos" ? rows.filter((p) => p.ativo).length
      : t.value === "inativos" ? rows.filter((p) => !p.ativo).length
      : t.value === "incompletos" ? rows.filter(cadastroIncompleto).length
      : rows.filter((p) => p.duplicado_hint).length,
  }));

  return (
    <div className="h-full flex flex-col min-h-0">
      <ResumoBar k={kpis} activeMode={resumoMode} onSelect={setResumoMode} />
      <div className="flex-1 min-h-0 p-3 sm:p-4">
        <ListShell<TabV>
          title={
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold">Clientes</h1>
              {totalBase !== null && !modoBusca && (
                <span className="text-xs text-muted-foreground">
                  base ~{totalBase.toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  {compactPref ? <Rows3 className="h-3.5 w-3.5" /> : <LayoutList className="h-3.5 w-3.5" />}
                  Compacto
                  <Switch checked={compactPref} onCheckedChange={onToggleCompact} data-testid="toggle-compact" />
                </Label>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={ordenados.length === 0}>
                    <Download className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Exportar</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {ordenados.length} resultado(s) filtrado(s)
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => exportarPacientesCSV(ordenados)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV (todos os filtrados)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportarPacientesPDF(ordenados, resumoExport)}>
                    <Printer className="h-4 w-4 mr-2" /> PDF (todos os filtrados)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => exportarPacientesCSV(visiveis)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV (página atual)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportarPacientesPDF(visiveis, `${resumoExport} · página ${paginaAtual}`)}>
                    <Printer className="h-4 w-4 mr-2" /> PDF (página atual)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" asChild>
                <Link to="/app/clientes"><Plus className="h-4 w-4 mr-1" /> Novo</Link>
              </Button>
            </div>
          }
          searchValue={q}
          onSearchChange={setQ}
          searchPlaceholder="Buscar por nome, CPF, telefone, prontuário, pasta ou nascimento (DD/MM/AAAA)…"
          searchDebounceMs={300}
          tabs={tabsWithCounts}
          tabValue={tab}
          onTabChange={setTab}
          chips={
            <div className="flex flex-wrap items-center gap-3">
              <Select value={campo} onValueChange={(v) => setCampo(v as CampoBusca)}>
                <SelectTrigger className="h-8 w-[168px] text-xs" aria-label="Campo da busca">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPO_OPTS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={convenio} onValueChange={setConvenio}>
                <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Filtrar por convênio">
                  <SelectValue placeholder="Convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">Todos os convênios</SelectItem>
                  <SelectItem value="__particular__" className="text-xs">Particular</SelectItem>
                  {conveniosDisponiveis.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <QuickFilters options={CHIP_OPTS} value={chips} onChange={setChips} multi ariaLabel="Filtros rápidos" />
              <div
                className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-0.5"
                role="group"
                aria-label="Ordenar resultados"
              >
                <span className="px-1.5 text-[11px] text-muted-foreground hidden sm:inline">Ordenar</span>
                {ORDEM_OPTS.map((o) => {
                  const ativo = ordem === o.value;
                  const Icon = !ativo ? ArrowUpDown : dirOrdem === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      title={o.title}
                      aria-pressed={ativo}
                      aria-label={`${o.title}${ativo ? (dirOrdem === "asc" ? " (crescente)" : " (decrescente)") : ""}`}
                      onClick={() => aplicarOrdem(o.value)}
                      className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        ativo
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {o.label}
                      <Icon className={`h-3 w-3 ${ativo ? "opacity-100" : "opacity-50"}`} />
                    </button>
                  );
                })}
              </div>
              {!modoBusca && (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  {resumoMode === "none"
                    ? "Mostrando pacientes recentes. Use a busca para localizar qualquer paciente."
                    : "Filtro do painel ativo (limite ampliado). Clique no card novamente para voltar."}
                </div>
              )}
            </div>
          }
          loading={loading}
          isEmpty={!loading && ordenados.length === 0}
          empty={
            modoBusca
              ? <div>Nenhum paciente encontrado para <b>“{q}”</b>.</div>
              : <div>Sem pacientes recentes nesta clínica.</div>
          }
          bodyClassName="bg-background"
        >
          <div
            ref={listaRef}
            role="listbox"
            aria-label="Resultados de pacientes"
            tabIndex={-1}
            onKeyDown={onListaKeyDown}
            onFocus={() => setNavTeclado(true)}
          >
            <VirtualList<PacienteV2>
              items={visiveis}
              estimateSize={compactPref ? 52 : 78}
              overscan={10}
              getKey={(p) => p.id}
              renderItem={(p, i) => (
                <div className="px-2 py-1" role="option" aria-selected={i === focoIdx}>
                  <ClienteCard
                    p={p}
                    compact={compactPref}
                    termo={modoBusca ? q.trim() : ""}
                    index={i}
                    active={i === focoIdx}
                    onOpen={setDrawer}
                  />
                </div>
              )}
            />
          </div>
          {!loading && visiveis.length > 0 && (
            <p className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
              Teclado: <kbd className="rounded border px-1">↑</kbd>/<kbd className="rounded border px-1">↓</kbd> navegar ·{" "}
              <kbd className="rounded border px-1">Enter</kbd> abrir detalhes ·{" "}
              <kbd className="rounded border px-1">Alt+Enter</kbd> abrir perfil
            </p>
          )}
        </ListShell>
        {!loading && ordenados.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {(paginaAtual - 1) * pageSize + 1}–{Math.min(paginaAtual * pageSize, ordenados.length)} de{" "}
              {ordenados.length}
            </span>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Itens por página">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">{n} por página</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline" size="sm" className="h-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={paginaAtual <= 1}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">{paginaAtual}/{totalPaginas}</span>
              <Button
                variant="outline" size="sm" className="h-8"
                onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual >= totalPaginas}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      <ClientesKpiBar k={kpi} modoBusca={modoBusca} />
      <ClienteDrawer paciente={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}