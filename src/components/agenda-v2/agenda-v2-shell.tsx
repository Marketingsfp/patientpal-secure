import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, LayoutList, GanttChartSquare, CalendarDays,
  Search, Rows3, Rows2, Sparkles, Plus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { KpiBar, type Kpi } from "./kpi-bar";
import { SessionCard, type SessionCardData, type SessionDensity } from "./session-card";
import { AgendaV2Sidebar } from "./agenda-v2-sidebar";
import type { TimelineData } from "./patient-timeline-drawer";
import { tipoDaSessao, type ProcMeta } from "@/lib/agenda-v2/session-detect";
import { cn } from "@/lib/utils";

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
  const clinicaNome = clinicaAtual?.clinica?.nome ?? "Clínica";

  const [dia, setDia] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [view, setView] = useState<ViewMode>("timeline");
  const [q, setQ] = useState("");
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [filtroMedico, setFiltroMedico] = useState<string>("");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<string>("");
  const [filtroRecurso, setFiltroRecurso] = useState<string>("");
  const [drawerPacote, setDrawerPacote] = useState<string | null>(null);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [density, setDensity] = useState<SessionDensity>(() => {
    if (typeof window === "undefined") return "confortavel";
    return (window.localStorage.getItem(DENSITY_KEY) as SessionDensity) ?? "confortavel";
  });
  const [loadedMs, setLoadedMs] = useState<number | null>(null);
  const startedAtRef = useRef<number>(0);

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

  const especialidadesQuery = useQuery({
    queryKey: ["agenda-v2", "especialidades", clinicaId],
    enabled: !!clinicaId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [esps, links] = await Promise.all([
        supabase.from("especialidades").select("id,nome").order("nome"),
        supabase.from("medico_especialidades")
          .select("medico_id,especialidade_id,medicos!inner(clinica_id)")
          .eq("medicos.clinica_id", clinicaId!),
      ]);
      const espMap = new Map<string, string>((esps.data ?? []).map((e: { id: string; nome: string }) => [e.id, e.nome]));
      const medToEsps = new Map<string, Set<string>>();
      for (const l of (links.data ?? []) as Array<{ medico_id: string; especialidade_id: string }>) {
        if (!l.medico_id || !l.especialidade_id) continue;
        const s = medToEsps.get(l.medico_id) ?? new Set<string>();
        s.add(l.especialidade_id);
        medToEsps.set(l.medico_id, s);
      }
      return { espMap, medToEsps };
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
      startedAtRef.current = performance.now();
      const start = new Date(diaKey);
      const end = new Date(diaKey); end.setHours(23, 59, 59, 999);
      const { data } = await supabase.from("agendamentos")
        .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,pacote_id,enfermagem_recurso_id,fluxo_etapa,fluxo_atualizado_em")
        .eq("clinica_id", clinicaId!)
        .gte("inicio", start.toISOString())
        .lte("inicio", end.toISOString())
        .order("inicio", { ascending: true });
      return (data ?? []) as RawAg[];
    },
  });

  // Move setLoadedMs para efeito — evita re-render dentro do queryFn.
  useEffect(() => {
    if (agsQuery.isFetched && startedAtRef.current > 0) {
      setLoadedMs(Math.round(performance.now() - startedAtRef.current));
      startedAtRef.current = 0;
    }
  }, [agsQuery.isFetched, agsQuery.dataUpdatedAt]);

  const rows = agsQuery.data ?? null;
  const medicos = medicosQuery.data ?? new Map<string, string>();
  const recursos = recursosQuery.data ?? new Map<string, string>();
  const procMeta = procMetaQuery.data ?? new Map<string, ProcMeta>();
  const espData = especialidadesQuery.data;

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
        medico_id: primeiro.medico_id,
        recurso_id: primeiro.enfermagem_recurso_id,
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
      // Ocultar sessões "DISPONIVEL" — são horários livres, não pertencem
      // ao fluxo operacional; ficam agrupadas em resumo por hora.
      if (/^disponivel$/i.test((s.paciente_nome ?? "").trim())) return false;
      if (kpiFilter && kpiFilter !== "todos") {
        if (kpiFilter === "lab" && s.tipo !== "coleta_laboratorial") return false;
        if (kpiFilter !== "lab" && s.status !== kpiFilter) return false;
      }
      if (filtroMedico && s.medico_id !== filtroMedico) return false;
      if (filtroRecurso && s.recurso_id !== filtroRecurso) return false;
      if (filtroEspecialidade) {
        const mid = s.medico_id;
        const set = mid ? espData?.medToEsps.get(mid) : null;
        if (!set || !set.has(filtroEspecialidade)) return false;
      }
      if (norm) {
        const hay = `${s.paciente_nome} ${s.medico_nome ?? ""} ${s.recurso_nome ?? ""} ${s.items.map((i) => i.procedimento_nome).join(" ")}`.toLowerCase();
        if (!hay.includes(norm)) return false;
      }
      return true;
    });
  }, [sessoes, q, kpiFilter, filtroMedico, filtroRecurso, filtroEspecialidade, espData]);

  // Contagem de horários livres por hora (para o resumo discreto na timeline).
  const livresPorHora = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of sessoes) {
      if (!/^disponivel$/i.test((s.paciente_nome ?? "").trim())) continue;
      const h = new Date(s.inicio).getHours();
      m.set(h, (m.get(h) ?? 0) + 1);
    }
    return m;
  }, [sessoes]);

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

  // Agrupar sessões por hora para render com régua de horas.
  const porHora = useMemo(() => {
    const map = new Map<number, SessionCardData[]>();
    for (const s of filtradas) {
      const h = new Date(s.inicio).getHours();
      const arr = map.get(h) ?? [];
      arr.push(s);
      map.set(h, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filtradas]);

  // Recursos com ocupação (usados = sessões distintas do dia usando o recurso).
  const recursosOcup = useMemo(() => {
    const usados = new Map<string, number>();
    for (const s of sessoes) if (s.recurso_id) usados.set(s.recurso_id, (usados.get(s.recurso_id) ?? 0) + 1);
    return Array.from(recursos.entries()).map(([id, nome]) => ({
      id, nome, usados: usados.get(id) ?? 0, total: Math.max(usados.get(id) ?? 0, 8),
    }));
  }, [recursos, sessoes]);

  // Equipe on-line = médicos com sessões hoje (proxy simples e sem query nova).
  const equipeOnline = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessoes) if (s.medico_id) ids.add(s.medico_id);
    return Array.from(ids).map((id) => ({ id, nome: medicos.get(id) ?? "—" }));
  }, [sessoes, medicos]);

  // Hora atual (para "now-line") e turno atual.
  const now = new Date();
  const nowHour = now.getHours();
  const nowMin = now.getMinutes();
  const isToday = new Date(diaKey).toDateString() === new Date().toDateString();

  return (
    <div className="h-full flex bg-[#FBFBFA]">
      <AgendaV2Sidebar
        clinicaNome={clinicaNome}
        dia={dia}
        sessoes={sessoes}
        recursos={recursosOcup}
        equipeOnline={equipeOnline}
      />

      <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-100 bg-white/80 backdrop-blur-sm px-6 py-5 space-y-5 shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Agenda do Dia
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 capitalize">
              {format(dia, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-9 px-4 rounded-2xl gap-1.5 bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-[1px]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="text-xs font-semibold">Nova sessão</span>
            </Button>

            <ToggleGroup
              type="single"
              value={density}
              onValueChange={(v) => v && setDensity(v as SessionDensity)}
              className="bg-slate-100 p-1 rounded-2xl"
            >
              <ToggleGroupItem value="confortavel" aria-label="Confortável" className="h-8 w-8 rounded-xl data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <Rows3 className="h-3.5 w-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="compacto" aria-label="Compacto" className="h-8 w-8 rounded-xl data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <Rows2 className="h-3.5 w-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as ViewMode)}
              className="bg-slate-100 p-1 rounded-2xl"
            >
              <ToggleGroupItem value="timeline" aria-label="Timeline" className="h-8 px-3 gap-1.5 rounded-xl data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <GanttChartSquare className="h-3.5 w-3.5" /> <span className="hidden sm:inline text-xs">Timeline</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Lista" className="h-8 px-3 gap-1.5 rounded-xl data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <LayoutList className="h-3.5 w-3.5" /> <span className="hidden sm:inline text-xs">Lista</span>
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex items-center gap-0.5 ml-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-100" onClick={() => navDia(-1)} aria-label="Dia anterior">
                <ChevronLeft className="h-4 w-4 text-slate-400" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDia(d); }}
              >
                Hoje
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-100" onClick={() => navDia(1)} aria-label="Próximo dia">
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-64 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar paciente, médico, sala, exame…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 h-10 rounded-2xl bg-slate-100 border-transparent focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-slate-200 text-sm placeholder:text-slate-400"
              aria-label="Busca"
            />
          </div>
          <SearchableSelect
            options={[{ value: "", label: "Todos os profissionais" }, ...Array.from(medicos.entries()).map(([id, nome]) => ({ value: id, label: nome }))]}
            value={filtroMedico}
            onChange={setFiltroMedico}
            placeholder="Profissional"
            searchPlaceholder="Buscar profissional..."
            className="h-10 rounded-2xl bg-slate-100 border-transparent min-w-48"
          />
          <SearchableSelect
            options={[{ value: "", label: "Todas as especialidades" }, ...Array.from(espData?.espMap.entries() ?? []).map(([id, nome]) => ({ value: id, label: nome }))]}
            value={filtroEspecialidade}
            onChange={setFiltroEspecialidade}
            placeholder="Especialidade"
            searchPlaceholder="Buscar especialidade..."
            className="h-10 rounded-2xl bg-slate-100 border-transparent min-w-44"
          />
          <SearchableSelect
            options={[{ value: "", label: "Todas as salas" }, ...Array.from(recursos.entries()).map(([id, nome]) => ({ value: id, label: nome }))]}
            value={filtroRecurso}
            onChange={setFiltroRecurso}
            placeholder="Sala / recurso"
            searchPlaceholder="Buscar sala..."
            className="h-10 rounded-2xl bg-slate-100 border-transparent min-w-40"
          />
          {(filtroMedico || filtroEspecialidade || filtroRecurso || kpiFilter) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-2xl text-xs text-slate-500 hover:text-slate-900"
              onClick={() => { setFiltroMedico(""); setFiltroEspecialidade(""); setFiltroRecurso(""); setKpiFilter(null); }}
            >
              Limpar filtros
            </Button>
          )}
          <div className="text-xs text-slate-500 inline-flex items-center gap-2 ml-auto">
            <Sparkles className="h-3 w-3 text-slate-400" />
            <span className="tabular-nums">
              {rows === null
                ? "carregando…"
                : `${filtradas.length} ${filtradas.length === 1 ? "sessão" : "sessões"}`}
            </span>
            {loadedMs !== null && (
              <span className="text-slate-400 tabular-nums">· {loadedMs}ms</span>
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
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={compact ? "h-14 w-full rounded-2xl" : "h-24 w-full rounded-3xl"} />
            ))}
          </div>
        ) : filtradas.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-slate-500 p-6 text-center gap-3">
            <CalendarDays className="h-12 w-12 text-slate-300" />
            <div>Nenhuma sessão para os filtros atuais.</div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-6 pt-4 pb-8">
            {porHora.map(([hora, lista]) => {
              const isNowHour = isToday && hora === nowHour;
              return (
                <div key={hora} className="flex gap-4 relative">
                  {/* Coluna de hora (régua) */}
                  <div className="w-14 shrink-0 relative">
                    <div className={cn(
                      "sticky top-0 text-[11px] font-bold tabular-nums uppercase tracking-wider pt-1",
                      isNowHour ? "text-rose-600" : "text-slate-400",
                    )}>
                      {String(hora).padStart(2, "0")}:00
                    </div>
                  </div>
                  {/* Coluna de sessões */}
                  <div className="flex-1 min-w-0 border-l border-slate-100 pl-6 pb-4 relative">
                    {isNowHour && (
                      <div
                        className="absolute -left-[3px] right-0 flex items-center gap-2 z-10 pointer-events-none"
                        style={{ top: `${(nowMin / 60) * 100}%` }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]" />
                        <span className="flex-1 h-px bg-gradient-to-r from-rose-400 via-rose-200 to-transparent" />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500 pr-2">
                          agora · {String(nowHour).padStart(2, "0")}:{String(nowMin).padStart(2, "0")}
                        </span>
                      </div>
                    )}
                    <div className="space-y-3">
                      {lista.map((s) => (
                        <SessionCard key={s.pacote_id} data={s} onOpenTimeline={openDrawer} density={density} />
                      ))}
                      {livresPorHora.get(hora) && (
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 pl-1">
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          {livresPorHora.get(hora)} horário{livresPorHora.get(hora)! > 1 ? "s" : ""} livre{livresPorHora.get(hora)! > 1 ? "s" : ""} nesta hora
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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