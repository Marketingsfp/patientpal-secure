import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Info, Plus, Rows3, LayoutList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ListShell, VirtualList, QuickFilters,
  type StatusTab, type QuickFilterOption,
} from "@/components/list-shell";
import { ClienteCard } from "./cliente-card";
import { ClienteDrawer } from "./cliente-drawer";
import { ClientesKpiBar, type ClientesKpi } from "./kpi-bar";
import {
  cadastroIncompleto, marcarDuplicados, pagadorLabel,
  type PacienteV2,
} from "./status-utils";

type TabV = "todos" | "ativos" | "inativos" | "incompletos" | "duplicados";
type TipoV = "particular" | "associado" | "cartao";

const TAB_OPTS: ReadonlyArray<StatusTab<TabV>> = [
  { value: "todos", label: "Todos" },
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
  { value: "incompletos", label: "Cadastro incompleto" },
  { value: "duplicados", label: "Possíveis duplicidades" },
];

const TIPO_OPTS: ReadonlyArray<QuickFilterOption<TipoV>> = [
  { value: "particular", label: "Particular" },
  { value: "associado", label: "Associado" },
  { value: "cartao", label: "Cartão de Benefícios" },
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
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabV>("todos");
  const [tipo, setTipo] = useState<TipoV[]>([]);
  const [drawer, setDrawer] = useState<PacienteV2 | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [totalBase, setTotalBase] = useState<number | null>(null);
  const reqRef = useRef(0);

  const modoBusca = q.trim().length >= 2;
  const scope = useMemo(
    () => (clinicaIds.length ? clinicaIds : clinicaAtual ? [clinicaAtual.clinica_id] : []),
    [clinicaIds, clinicaAtual],
  );

  const loadRecentes = useCallback(async () => {
    if (!clinicaAtual || scope.length === 0) return;
    const myReq = ++reqRef.current;
    setLoading(true);
    // usar .eq quando houver 1 clínica — o planner faz index scan direto
    // no idx (clinica_id, created_at DESC). Com .in em base grande (200k+
    // pacientes) o planner às vezes escolhe scan e estoura statement_timeout.
    const cols =
      "id, clinica_id, nome, cpf, telefone, telefone2, data_nascimento, email, ativo, codigo_prontuario, codigo_prontuario_anterior, numero_pasta, cidade, estado, foto_url, created_at";
    const base = supabase.from("pacientes").select(cols);
    const scoped = scope.length === 1
      ? base.eq("clinica_id", scope[0])
      : base.in("clinica_id", scope);
    const { data, error } = await scoped
      .order("created_at", { ascending: false })
      .limit(50);
    if (myReq !== reqRef.current) return;
    if (error) { mostrarErro(error); setLoading(false); return; }
    setTotalBase(null);
    setRows(marcarDuplicados((data ?? []) as PacienteV2[]));
    setLoading(false);
  }, [clinicaAtual, scope]);

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
    if (tab === "ativos") r = r.filter((p) => p.ativo);
    else if (tab === "inativos") r = r.filter((p) => !p.ativo);
    else if (tab === "incompletos") r = r.filter(cadastroIncompleto);
    else if (tab === "duplicados") r = r.filter((p) => p.duplicado_hint);
    if (tipo.length > 0) {
      r = r.filter((p) => tipo.includes(pagadorLabel(p).tipo));
    }
    return r;
  }, [rows, tab, tipo]);

  const visiveis = filtrados.slice(0, pageSize);

  const kpi: ClientesKpi = useMemo(() => {
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
              <QuickFilters options={TIPO_OPTS} value={tipo} onChange={setTipo} multi ariaLabel="Tipo de pagador" />
              {!modoBusca && (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  Mostrando pacientes recentes. Use a busca para localizar qualquer paciente.
                </div>
              )}
            </div>
          }
          loading={loading}
          isEmpty={!loading && filtrados.length === 0}
          empty={
            modoBusca
              ? <div>Nenhum paciente encontrado para <b>“{q}”</b>.</div>
              : <div>Sem pacientes recentes nesta clínica.</div>
          }
          bodyClassName="bg-background"
        >
          <VirtualList<PacienteV2>
            items={visiveis}
            estimateSize={compactPref ? 52 : 78}
            overscan={10}
            getKey={(p) => p.id}
            onEndReached={() => {
              if (pageSize < filtrados.length) setPageSize((s) => Math.min(s + 50, filtrados.length));
            }}
            renderItem={(p) => (
              <div className="px-2 py-1">
                <ClienteCard p={p} compact={compactPref} onOpen={setDrawer} />
              </div>
            )}
          />
        </ListShell>
      </div>
      <ClientesKpiBar k={kpi} modoBusca={modoBusca} />
      <ClienteDrawer paciente={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}