import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, LayoutList, GanttChartSquare, CalendarDays,
  Search, Rows3, Rows2, Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VirtualList } from "@/components/list-shell/virtual-list";
import { KpiBar, type Kpi } from "./kpi-bar";
import { SessionCard, type SessionCardData, type SessionDensity } from "./session-card";
import type { TimelineData } from "./patient-timeline-drawer";
import { tipoDaSessao, type ProcMeta } from "@/lib/agenda-v2/session-detect";

// Drawer carrega só quando o usuário abrir — reduz JS crítico.
const PatientTimelineDrawer = lazy(() =>
  import("./patient-timeline-drawer").then((m) => ({ default: m.PatientTimelineDrawer })),
);

const DENSITY_KEY = "agenda_v2_density";

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
  const [drawerPacote, setDrawerPacote] = useState<string | null>(null);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [density, setDensity] = useState<SessionDensity>(() => {
    if (typeof window === "undefined") return "confortavel";
    return (window.localStorage.getItem(DENSITY_KEY) as SessionDensity) ?? "confortavel";
  });
  const [loadedMs, setLoadedMs] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  // Lookups (médicos / recursos / procedimentos) — cache por 10 min por clínica.
  // Não dependem do dia, então trocar a data não refaz essas queries.
  const medicosQuery = useQuery({
    queryKey: ["agenda-v2", "medicos", clinicaId],
    enabled: !!clinicaId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("medicos").select("id,nome").eq("clinica_id", clinicaId!);
      return new Map((data ?? []).map((m) => [m.id, m.nome]));
    },
  });

  const recursosQuery = useQuery({
    queryKey: ["agenda-v2", "recursos", clinicaId],
    enabled: !!clinicaId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("enfermagem_recursos").select("id,nome").eq("clinica_id", clinicaId!);
      return new Map((data ?? []).map((r) => [r.id, r.nome]));
    },
  });

  const procMetaQuery = useQuery({
    queryKey: ["agenda-v2", "proc-meta", clinicaId],
    enabled: !!clinicaId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("procedimentos")
        .select("nome,tipo,grupo").eq("clinica_id", clinicaId!);
      const pm = new Map<string, ProcMeta>();
      for (const p of data ?? []) {
        if (p.nome) pm.set(p.nome.toLowerCase(), { nome: p.nome, tipo: p.tipo, grupo: p.grupo });
      }
      return pm;
    },
  });

  // Agendamentos do dia — única query que muda com a data.
  const diaKey = useMemo(() => {
    const d = new Date(dia); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, [dia]);

  const agsQuery = useQuery<RawAg[]>({
    queryKey: ["agenda-v2", "ags", clinicaId, diaKey],
    enabled: !!clinicaId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const t0 = performance.now();
      const start = new Date(diaKey);
      const end = new Date(diaKey); end.setHours(23, 59, 59, 999);
      const { data } = await supabase.from("agendamentos")
        .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,pacote_id,enfermagem_recurso_id,fluxo_etapa,fluxo_atualizado_em")
        .eq("clinica_id", clinicaId!)
        .gte("inicio", start.toISOString())
        .lte("inicio", end.toISOString())
        .order("inicio", { ascending: true });
      setLoadedMs(Math.round(performance.now() - t0));
      return (data ?? []) as RawAg[];
    },
  });

  const rows = agsQuery.data ?? null;
  const medicos = medicosQuery.data ?? new Map<string, string>();
  const recursos = recursosQuery.data ?? new Map<string, string>();
  const procMeta = procMetaQuery.data ?? new Map<string, ProcMeta>();

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
      { key: "todos", label: "Total", value: c.total, tone: "info" },
      { key: "agendado", label: "Aguardando", value: c.aguardando, tone: "warn" },
      { key: "confirmado", label: "Confirmados", value: c.confirmados, tone: "info" },
      { key: "realizado", label: "Realizados", value: c.realizados, tone: "ok" },
      { key: "cancelado", label: "Cancel./Falta", value: c.cancelados, tone: "danger" },
      { key: "lab", label: "Coletas lab.", value: c.lab, tone: "ok" },
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

  const openDrawer = (id: string) => { setDrawerMounted(true); setDrawerPacote(id); };
  const compact = density === "compacto";

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-muted/20 to-background">
      {/* Header operacional — hierarquia clara, sem cara de sistema legado */}
      <div className="border-b bg-card/80 backdrop-blur-sm px-5 py-4 space-y-4 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navDia(-1)} aria-label="Dia anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 text-sm font-medium">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="capitalize">{format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
              <span className="text-muted-foreground font-normal">· {format(dia, "yyyy")}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navDia(1)} aria-label="Próximo dia">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDia(d); }}
            >
              Hoje
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={density}
              onValueChange={(v) => v && setDensity(v as SessionDensity)}
              className="bg-muted/60 p-0.5 rounded-full"
            >
              <ToggleGroupItem value="confortavel" aria-label="Confortável" className="h-7 px-2.5 rounded-full data-[state=on]:bg-background data-[state=on]:shadow-sm">
                <Rows3 className="h-3.5 w-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="compacto" aria-label="Compacto" className="h-7 px-2.5 rounded-full data-[state=on]:bg-background data-[state=on]:shadow-sm">
                <Rows2 className="h-3.5 w-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as ViewMode)}
              className="bg-muted/60 p-0.5 rounded-full"
            >
              <ToggleGroupItem value="timeline" aria-label="Timeline" className="h-7 px-2.5 gap-1.5 rounded-full data-[state=on]:bg-background data-[state=on]:shadow-sm">
                <GanttChartSquare className="h-3.5 w-3.5" /> <span className="hidden sm:inline text-xs">Timeline</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Lista" className="h-7 px-2.5 gap-1.5 rounded-full data-[state=on]:bg-background data-[state=on]:shadow-sm">
                <LayoutList className="h-3.5 w-3.5" /> <span className="hidden sm:inline text-xs">Lista</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-64 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar paciente, médico, sala, exame…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-9 rounded-full bg-muted/40 border-transparent focus-visible:bg-background focus-visible:border-border"
              aria-label="Busca"
            />
          </div>
          <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-primary/70" />
            <span className="tabular-nums">
              {rows === null
                ? "carregando…"
                : `${filtradas.length} ${filtradas.length === 1 ? "sessão" : "sessões"}`}
            </span>
            {loadedMs !== null && (
              <span className="text-muted-foreground/60 tabular-nums">· {loadedMs}ms</span>
            )}
          </div>
        </div>

        <KpiBar
          items={kpis}
          activeKey={kpiFilter}
          onSelect={(k) => setKpiFilter(kpiFilter === k ? null : k)}
          compact={compact}
        />
      </div>

      {/* Corpo */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {rows === null ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={compact ? "h-11 w-full rounded-xl" : "h-16 w-full rounded-xl"} />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground p-6 text-center gap-2">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
            <div>Nenhuma sessão para os filtros atuais.</div>
          </div>
        ) : (
          <VirtualList
            items={filtradas}
            estimateSize={compact ? 68 : (view === "timeline" ? 104 : 96)}
            getKey={(s) => s.pacote_id}
            className="px-4 pt-3"
            renderItem={(s) => (
              <div className="pb-2">
                <SessionCard data={s} onOpenTimeline={openDrawer} density={density} />
              </div>
            )}
          />
        )}
      </div>

      {drawerMounted && (
        <Suspense fallback={null}>
          <PatientTimelineDrawer
            open={!!drawerPacote}
            onOpenChange={(v) => { if (!v) setDrawerPacote(null); }}
            data={drawerData}
          />
        </Suspense>
      )}
    </div>
  );
}