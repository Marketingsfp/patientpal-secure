import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { printOrcamento } from "@/lib/print-orcamento";
import { Button } from "@/components/ui/button";
import { ListShell, VirtualList, QuickFilters, type StatusTab, type QuickFilterOption } from "@/components/list-shell";
import { ConversaoOrcamentoDialog } from "@/components/orcamentos/conversao-orcamento-dialog";
import { OrcamentoCard, pagadorLabel, type OrcV2 } from "./orcamento-card";
import { OrcamentoDrawer } from "./orcamento-drawer";
import { deriveStatus, type DerivedStatus } from "./status-utils";
import { ResumoBar, type ResumoData } from "./resumo-bar";
import { OrcamentosKpiBar, type OrcKpi } from "./kpi-bar";
import { HistoricoOrcamentoDialog } from "./historico-orcamento-dialog";

type TabV = "todos" | "abertos" | "convertidos" | "expirados" | "cancelados" | "pendencia";
type TipoV = "particular" | "associado" | "cartao";
type PeriodoV = "todos" | "hoje" | "7d" | "30d";

const TIPO_OPTS: ReadonlyArray<QuickFilterOption<TipoV>> = [
  { value: "particular", label: "Particular" },
  { value: "associado", label: "Associado" },
  { value: "cartao", label: "Cartão de Benefícios" },
];
const PERIODO_OPTS: ReadonlyArray<QuickFilterOption<PeriodoV>> = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

interface Props {
  compactPref: boolean;
  onToggleCompact: (v: boolean) => void;
}

export function OrcamentosShellV2({ compactPref, onToggleCompact }: Props) {
  const { clinicaAtual } = useClinica();
  const podeHistorico = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";

  const [list, setList] = useState<OrcV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabV>("todos");
  const [tipo, setTipo] = useState<TipoV[]>([]);
  const [periodo, setPeriodo] = useState<PeriodoV[]>([]);
  const [drawerOrc, setDrawerOrc] = useState<OrcV2 | null>(null);
  const [conversaoId, setConversaoId] = useState<string | null>(null);
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);

  const load = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id, numero, paciente_id, paciente_nome, paciente_telefone, medico_nome, forma_pagamento, valor_total, status, created_at, categoria, validade_dias")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { mostrarErro(error); setLoading(false); return; }
    const orcs = (data ?? []) as unknown as OrcV2[];
    const ids = orcs.map((o) => o.id);
    const pacIds = Array.from(new Set(orcs.map((o) => o.paciente_id).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const [{ data: ags }, { data: itens }, { data: links }, pacRes] = await Promise.all([
        supabase.from("agendamentos").select("orcamento_id, status").in("orcamento_id", ids).neq("status", "cancelado"),
        supabase.from("orcamento_itens").select("orcamento_id, quantidade, descricao").in("orcamento_id", ids),
        supabase.from("agendamento_orcamento_itens").select("orcamento_id, orcamento_item_id").in("orcamento_id", ids),
        pacIds.length > 0
          ? supabase.from("pacientes").select("id, cpf").in("id", pacIds)
          : Promise.resolve({ data: [] as { id: string; cpf: string | null }[] }),
      ]);
      const tot = new Map<string, number>();
      const real = new Map<string, number>();
      for (const a of (ags ?? []) as { orcamento_id: string; status: string }[]) {
        tot.set(a.orcamento_id, (tot.get(a.orcamento_id) ?? 0) + 1);
        if (a.status === "realizado") real.set(a.orcamento_id, (real.get(a.orcamento_id) ?? 0) + 1);
      }
      const totItens = new Map<string, number>();
      const procsTxt = new Map<string, string[]>();
      for (const it of (itens ?? []) as { orcamento_id: string; quantidade: number; descricao: string }[]) {
        totItens.set(it.orcamento_id, (totItens.get(it.orcamento_id) ?? 0) + Number(it.quantidade || 1));
        if (!procsTxt.has(it.orcamento_id)) procsTxt.set(it.orcamento_id, []);
        procsTxt.get(it.orcamento_id)!.push(it.descricao ?? "");
      }
      const consumidos = new Map<string, Set<string>>();
      for (const l of (links ?? []) as { orcamento_id: string; orcamento_item_id: string }[]) {
        if (!consumidos.has(l.orcamento_id)) consumidos.set(l.orcamento_id, new Set());
        consumidos.get(l.orcamento_id)!.add(l.orcamento_item_id);
      }
      const cpfMap = new Map<string, string>();
      for (const p of ((pacRes as { data: { id: string; cpf: string | null }[] | null }).data ?? [])) {
        if (p.cpf) cpfMap.set(p.id, p.cpf);
      }
      for (const o of orcs) {
        o.agendamentos_total = tot.get(o.id) ?? 0;
        o.agendamentos_realizados = real.get(o.id) ?? 0;
        o.itens_total = totItens.get(o.id) ?? 0;
        o.itens_consumidos = consumidos.get(o.id)?.size ?? 0;
        o.paciente_cpf = o.paciente_id ? (cpfMap.get(o.paciente_id) ?? null) : null;
        o.procedimentos_txt = (procsTxt.get(o.id) ?? []).join(" | ").toLowerCase();
      }
    }
    setList(orcs);
    setLoading(false);
  }, [clinicaAtual]);

  useEffect(() => { void load(); }, [load]);

  // Ctrl+Shift+C -> compacto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        onToggleCompact(!compactPref);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compactPref, onToggleCompact]);

  const inPeriodo = useCallback((iso: string): boolean => {
    if (periodo.length === 0) return true;
    const d = new Date(iso).getTime();
    const now = Date.now();
    return periodo.some((p) => {
      const days = p === "hoje" ? 1 : p === "7d" ? 7 : 30;
      return now - d <= days * 86400_000;
    });
  }, [periodo]);

  const applyBase = useCallback((o: OrcV2) => {
    const qq = q.trim().toLowerCase();
    if (qq) {
      const digits = qq.replace(/\D/g, "");
      const hit =
        o.paciente_nome.toLowerCase().includes(qq) ||
        String(o.numero).includes(qq) ||
        (o.medico_nome ?? "").toLowerCase().includes(qq) ||
        (o.procedimentos_txt ?? "").includes(qq) ||
        (digits.length >= 3 && (
          (o.paciente_cpf ?? "").replace(/\D/g, "").includes(digits) ||
          (o.paciente_telefone ?? "").replace(/\D/g, "").includes(digits)
        ));
      if (!hit) return false;
    }
    if (!inPeriodo(o.created_at)) return false;
    if (tipo.length > 0) {
      const pag = pagadorLabel(o.forma_pagamento);
      const map: Record<TipoV, string> = { particular: "Particular", associado: "Associado", cartao: "Cartão de Benefícios" };
      if (!tipo.some((t) => map[t] === pag)) return false;
    }
    return true;
  }, [q, tipo, inPeriodo]);

  const matchTab = (o: OrcV2, t: TabV): boolean => {
    if (t === "todos") return true;
    const st = deriveStatus(o);
    if (t === "pendencia") return st === "convertido" && (o.itens_consumidos ?? 0) < (o.itens_total ?? 0);
    const map: Record<Exclude<TabV, "todos" | "pendencia">, DerivedStatus> = {
      abertos: "aberto", aprovados: "aprovado", convertidos: "convertido",
      expirados: "expirado", cancelados: "cancelado",
    };
    return st === map[t as Exclude<TabV, "todos" | "pendencia">];
  };

  const { counts, resumo, kpi } = useMemo(() => {
    const base = list.filter(applyBase);
    const c = { todos: base.length, abertos: 0, aprovados: 0, convertidos: 0, expirados: 0, cancelados: 0, pendencia: 0 };
    let valorAberto = 0, valorConvPeriodo = 0, valorConvHoje = 0, conversoesHoje = 0;
    const startHoje = new Date(); startHoje.setHours(0, 0, 0, 0);
    for (const o of base) {
      const st = deriveStatus(o);
      if (st === "aberto") { c.abertos++; valorAberto += Number(o.valor_total); }
      else if (st === "aprovado") c.aprovados++;
      else if (st === "convertido") {
        c.convertidos++;
        valorConvPeriodo += Number(o.valor_total);
        if (new Date(o.created_at).getTime() >= startHoje.getTime()) {
          valorConvHoje += Number(o.valor_total); conversoesHoje++;
        }
        if ((o.itens_consumidos ?? 0) < (o.itens_total ?? 0)) c.pendencia++;
      }
      else if (st === "expirado") c.expirados++;
      else if (st === "cancelado") c.cancelados++;
    }
    const ticketMedio = base.length ? base.reduce((s, o) => s + Number(o.valor_total), 0) / base.length : 0;
    const conversaoPct = c.todos ? (c.convertidos / c.todos) * 100 : 0;
    const r: ResumoData = {
      total: c.todos, abertos: c.abertos, aprovados: c.aprovados,
      convertidos: c.convertidos, expirados: c.expirados,
      valorAberto, valorConvertidoPeriodo: valorConvPeriodo, ticketMedio,
    };
    const k: OrcKpi = { valorAberto, valorConvertidoHoje: valorConvHoje, conversoesHoje, conversaoPct, ticketMedio };
    return { counts: c, resumo: r, kpi: k };
  }, [list, applyBase]);

  const filtered = useMemo(
    () => list.filter((o) => applyBase(o) && matchTab(o, tab)),
    [list, applyBase, tab],
  );

  const visible = filtered.slice(0, pageSize);

  const tabs: ReadonlyArray<StatusTab<TabV>> = [
    { value: "todos", label: "Todos", count: counts.todos },
    { value: "abertos", label: "Abertos", count: counts.abertos },
    { value: "aprovados", label: "Aprovados", count: counts.aprovados },
    { value: "convertidos", label: "Convertidos", count: counts.convertidos },
    { value: "expirados", label: "Expirados", count: counts.expirados },
    { value: "cancelados", label: "Cancelados", count: counts.cancelados },
    { value: "pendencia", label: "Pendência", count: counts.pendencia },
  ];

  const imprimir = async (id: string) => {
    if (!clinicaAtual) return;
    try { await printOrcamento(id, clinicaAtual.clinica_id); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="h-full p-3 sm:p-4 flex flex-col min-h-0">
      <ResumoBar data={resumo} />
      <ListShell<TabV>
        title={
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Orçamentos</h1>
            <span className="text-xs text-muted-foreground">v2 (preview)</span>
          </div>
        }
        actions={
          <>
            <Button
              size="sm"
              variant={compactPref ? "default" : "outline"}
              onClick={() => onToggleCompact(!compactPref)}
              data-testid="toggle-compact"
              title="Modo compacto (Ctrl+Shift+C)"
            >
              Compacto
            </Button>
            <Button size="sm" asChild>
              <a href="/app/orcamentos"><Plus className="h-4 w-4" /> Novo</a>
            </Button>
          </>
        }
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Buscar por paciente, nº, CPF, telefone, procedimento ou médico…"
        tabs={tabs}
        tabValue={tab}
        onTabChange={setTab}
        chips={
          <div className="flex flex-wrap gap-3">
            <QuickFilters<TipoV> options={TIPO_OPTS} value={tipo} onChange={setTipo} multi ariaLabel="Tipo de pagador" />
            <QuickFilters<PeriodoV> options={PERIODO_OPTS} value={periodo} onChange={setPeriodo} ariaLabel="Período" />
          </div>
        }
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        empty={<span>Nenhum orçamento encontrado com esses filtros.</span>}
        bodyClassName="bg-card"
      >
        <VirtualList<OrcV2>
          items={visible}
          estimateSize={compactPref ? 48 : 76}
          getKey={(o) => o.id}
          onEndReached={() => {
            if (visible.length < filtered.length) setPageSize((n) => n + 50);
          }}
          renderItem={(o) => (
            <OrcamentoCard
              o={o}
              compact={compactPref}
              onOpen={() => setDrawerOrc(o)}
              onPrint={() => void imprimir(o.id)}
              onConverter={() => setConversaoId(o.id)}
              podeHistorico={podeHistorico}
            />
          )}
        />
      </ListShell>
      <OrcamentosKpiBar data={kpi} />

      <OrcamentoDrawer
        orc={drawerOrc}
        onClose={() => setDrawerOrc(null)}
        onPrint={(id) => void imprimir(id)}
        onConverter={(id) => setConversaoId(id)}
        podeHistorico={podeHistorico}
      />

      {conversaoId && (
        <ConversaoOrcamentoDialog
          open={!!conversaoId}
          onClose={() => setConversaoId(null)}
          orcamentoId={conversaoId}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}