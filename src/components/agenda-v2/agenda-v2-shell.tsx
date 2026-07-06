import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Filter, LayoutList, GanttChartSquare, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VirtualList } from "@/components/list-shell/virtual-list";
import { KpiBar, type Kpi } from "./kpi-bar";
import { SessionCard, type SessionCardData } from "./session-card";
import { PatientTimelineDrawer, type TimelineData } from "./patient-timeline-drawer";
import { tipoDaSessao, type ProcMeta } from "@/lib/agenda-v2/session-detect";

type ViewMode = "timeline" | "list";

interface RawAg {
  id: string;
  paciente_nome: string;
  paciente_id: string | null;
  medico_id: string | null;
  inicio: string;
  fim: string;
  procedimento: string | null;
  status: string;
  pacote_id: string | null;
  enfermagem_recurso_id: string | null;
  fluxo_etapa: string | null;
  fluxo_atualizado_em: string | null;
}

export function AgendaV2Shell() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const [dia, setDia] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [view, setView] = useState<ViewMode>("timeline");
  const [q, setQ] = useState("");
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [rows, setRows] = useState<RawAg[] | null>(null);
  const [medicos, setMedicos] = useState<Map<string, string>>(new Map());
  const [recursos, setRecursos] = useState<Map<string, string>>(new Map());
  const [procMeta, setProcMeta] = useState<Map<string, ProcMeta>>(new Map());
  const [drawerPacote, setDrawerPacote] = useState<string | null>(null);
  const [loadStart, setLoadStart] = useState<number>(0);
  const [loadedMs, setLoadedMs] = useState<number | null>(null);

  useEffect(() => {
    if (!clinicaId) return;
    setRows(null);
    setLoadedMs(null);
    const t0 = performance.now();
    setLoadStart(t0);

    const start = new Date(dia); start.setHours(0, 0, 0, 0);
    const end = new Date(dia); end.setHours(23, 59, 59, 999);

    void (async () => {
      const [ags, meds, recs, procs] = await Promise.all([
        supabase.from("agendamentos")
          .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,pacote_id,enfermagem_recurso_id,fluxo_etapa,fluxo_atualizado_em")
          .eq("clinica_id", clinicaId)
          .gte("inicio", start.toISOString())
          .lte("inicio", end.toISOString())
          .order("inicio", { ascending: true }),
        supabase.from("medicos").select("id,nome").eq("clinica_id", clinicaId),
        supabase.from("enfermagem_recursos").select("id,nome").eq("clinica_id", clinicaId),
        supabase.from("procedimentos").select("id,nome,tipo,grupo").eq("clinica_id", clinicaId),
      ]);

      setMedicos(new Map((meds.data ?? []).map((m) => [m.id, m.nome])));
      setRecursos(new Map((recs.data ?? []).map((r) => [r.id, r.nome])));
      const pm = new Map<string, ProcMeta>();
      for (const p of procs.data ?? []) {
        pm.set(p.nome.toLowerCase(), { nome: p.nome, tipo: p.tipo, grupo: p.grupo });
      }
      setProcMeta(pm);
      setRows((ags.data ?? []) as RawAg[]);
      setLoadedMs(Math.round(performance.now() - t0));
    })();
  }, [clinicaId, dia]);

  // Agrupar em sessões por pacote_id (ou id do próprio agendamento).
  const sessoes = useMemo<SessionCardData[]>(() => {
    if (!rows) return [];
    const map = new Map<string, RawAg[]>();
    for (const r of rows) {
      const key = r.pacote_id ?? r.id;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    const list: SessionCardData[] = [];
    for (const [key, group] of map.entries()) {
      const primeiro = group[0];
      const items: ProcMeta[] = group.map((g) => {
        const nome = g.procedimento ?? "";
        const key = nome.toLowerCase();
        const meta = procMeta.get(key);
        if (meta) return meta;
        // Fallback heurístico quando o texto livre do agendamento não bate
        // com o catálogo (ex.: "GLICOSE BASAL (LABORATORIO)").
        const grupoInf = /\bLABORAT/i.test(nome) ? "Laboratório"
          : /\bRAIO|\bTOMOG|\bRESSON|\bULTRASSOM|\bIMAGEM/i.test(nome) ? "Imagem"
          : /\bENDOSC|\bCOLONOSC/i.test(nome) ? "Endoscopia"
          : /\bCARDIO|\bECOCARDIO|\bELETROC/i.test(nome) ? "Cardiologia"
          : null;
        return { nome, tipo: null, grupo: grupoInf };
      });
      const tipo = tipoDaSessao(items);
      list.push({
        pacote_id: key,
        paciente_nome: primeiro.paciente_nome,
        paciente_id: primeiro.paciente_id,
        medico_nome: primeiro.medico_id ? medicos.get(primeiro.medico_id) ?? null : null,
        recurso_nome: primeiro.enfermagem_recurso_id ? recursos.get(primeiro.enfermagem_recurso_id) ?? null : null,
        inicio: primeiro.inicio,
        fim: group[group.length - 1].fim,
        tipo,
        status: primeiro.status,
        items: group.map((g) => ({ id: g.id, procedimento_nome: g.procedimento ?? "—", status: g.status })),
      });
    }
    list.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return list;
  }, [rows, procMeta, medicos, recursos]);

  const kpis = useMemo<Kpi[]>(() => {
    const c = { total: sessoes.length, aguardando: 0, confirmados: 0, realizados: 0, cancelados: 0, lab: 0 };
    for (const s of sessoes) {
      if (s.status === "agendado") c.aguardando++;
      if (s.status === "confirmado") c.confirmados++;
      if (s.status === "realizado") c.realizados++;
      if (s.status === "cancelado" || s.status === "faltou") c.cancelados++;
      if (s.tipo === "coleta_laboratorial") c.lab++;
    }
    return [
      { key: "todos", label: "Todos", value: c.total },
      { key: "agendado", label: "Aguardando", value: c.aguardando, tone: "warn" },
      { key: "confirmado", label: "Confirmados", value: c.confirmados, tone: "default" },
      { key: "realizado", label: "Realizados", value: c.realizados, tone: "ok" },
      { key: "cancelado", label: "Cancel./Falta", value: c.cancelados, tone: "danger" },
      { key: "lab", label: "Coletas Lab", value: c.lab, tone: "default" },
    ];
  }, [sessoes]);

  const filtradas = useMemo(() => {
    const norm = q.trim().toLowerCase();
    return sessoes.filter((s) => {
      if (kpiFilter && kpiFilter !== "todos") {
        if (kpiFilter === "lab" && s.tipo !== "coleta_laboratorial") return false;
        if (kpiFilter !== "lab" && s.status !== kpiFilter) return false;
      }
      if (norm) {
        const hay = `${s.paciente_nome} ${s.medico_nome ?? ""} ${s.recurso_nome ?? ""} ${s.items.map((i) => i.procedimento_nome).join(" ")}`.toLowerCase();
        if (!hay.includes(norm)) return false;
      }
      return true;
    });
  }, [sessoes, q, kpiFilter]);

  const drawerData = useMemo<TimelineData | null>(() => {
    if (!drawerPacote || !rows) return null;
    const grupo = rows.filter((r) => (r.pacote_id ?? r.id) === drawerPacote);
    if (grupo.length === 0) return null;
    const primeiro = grupo[0];
    return {
      paciente_nome: primeiro.paciente_nome,
      etapa_atual: primeiro.fluxo_etapa ?? "aguardando_recepcao",
      historico: primeiro.fluxo_atualizado_em
        ? [{ etapa: primeiro.fluxo_etapa ?? "aguardando_recepcao", timestamp: primeiro.fluxo_atualizado_em }]
        : [],
    };
  }, [drawerPacote, rows]);

  const navDia = (delta: number) => {
    const d = new Date(dia); d.setDate(d.getDate() + delta); setDia(d);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header operacional */}
      <div className="border-b bg-card p-3 space-y-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => navDia(-1)} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {format(dia, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </div>
          <Button variant="outline" size="icon" onClick={() => navDia(1)} aria-label="Próximo dia">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDia(d); }}>Hoje</Button>

          <div className="ml-auto flex items-center gap-2">
            <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as ViewMode)}>
              <ToggleGroupItem value="timeline" aria-label="Timeline" className="gap-1.5">
                <GanttChartSquare className="h-4 w-4" /> <span className="hidden sm:inline text-xs">Timeline</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Lista" className="gap-1.5">
                <LayoutList className="h-4 w-4" /> <span className="hidden sm:inline text-xs">Lista</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-64 max-w-md">
            <Input
              placeholder="Buscar paciente, médico, sala, exame…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-3"
              aria-label="Busca"
            />
          </div>
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Filter className="h-3 w-3" />
            {loadedMs !== null ? `${filtradas.length} sessões · ${loadedMs}ms` : "carregando…"}
          </div>
        </div>

        <KpiBar items={kpis} activeKey={kpiFilter} onSelect={(k) => setKpiFilter(kpiFilter === k ? null : k)} />
      </div>

      {/* Corpo */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {rows === null ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtradas.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
            Nenhuma sessão para os filtros atuais.
          </div>
        ) : (
          <VirtualList
            items={filtradas}
            estimateSize={view === "timeline" ? 110 : 92}
            getKey={(s) => s.pacote_id}
            className="p-3"
            renderItem={(s) => (
              <div className="pb-2 pr-2">
                <SessionCard data={s} onOpenTimeline={setDrawerPacote} />
              </div>
            )}
          />
        )}
      </div>

      <PatientTimelineDrawer
        open={!!drawerPacote}
        onOpenChange={(v) => { if (!v) setDrawerPacote(null); }}
        data={drawerData}
      />
    </div>
  );
}