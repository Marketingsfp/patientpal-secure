import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, LayoutList, GanttChartSquare, CalendarDays,
  Search, Rows3, Rows2, Focus, Sparkles, Plus, Keyboard, PanelLeft,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { KpiBar, type Kpi } from "./kpi-bar";
import { SessionCard, type SessionCardData, type SessionDensity } from "./session-card";
import type { DrawerPatientData } from "./patient-drawer";
import { tipoDaSessao, type ProcMeta } from "@/lib/agenda-v2/session-detect";
import { cn } from "@/lib/utils";

// Lazy — só baixa quando efetivamente aparecem em tela.
// Header + timeline + cards + KPIs permanecem no bundle crítico.
const AgendaV2Sidebar = lazy(() =>
  import("./agenda-v2-sidebar").then((m) => ({ default: m.AgendaV2Sidebar })),
);
const AiInsightsStrip = lazy(() =>
  import("./ai-insights-strip").then((m) => ({ default: m.AiInsightsStrip })),
);
const PatientDrawer = lazy(() =>
  import("./patient-drawer").then((m) => ({ default: m.PatientDrawer })),
);
const NovoAgendamentoWizard = lazy(() =>
  import("./novo-agendamento-wizard").then((m) => ({ default: m.NovoAgendamentoWizard })),
);

const DENSITY_KEY = "agenda_v2_density";

function densityStorageKey(clinicaId: string | null) {
  return clinicaId ? `${DENSITY_KEY}:${clinicaId}` : DENSITY_KEY;
}
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const t = el.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.closest('[role="dialog"], [role="listbox"], [role="combobox"]')) return true;
  return false;
}

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
  const queryClient = useQueryClient();

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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [density, setDensity] = useState<SessionDensity>(() => {
    if (typeof window === "undefined") return "confortavel";
    // fallback: chave legada (sem clínica) para não perder preferência do usuário.
    return ((window.localStorage.getItem(DENSITY_KEY) as SessionDensity) ??
      "confortavel");
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const isMobile = useIsMobile();
  const [loadedMs, setLoadedMs] = useState<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(performance.now());
  const [renderMs, setRenderMs] = useState<number | null>(null);

  // Densidade persistida por usuário + clínica. Ao trocar de clínica,
  // recarrega o modo salvo daquela clínica (fallback: chave global).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(densityStorageKey(clinicaId));
    if (saved && saved !== density) setDensity(saved as SessionDensity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(densityStorageKey(clinicaId), density);
    window.localStorage.setItem(DENSITY_KEY, density); // fallback global
  }, [density, clinicaId]);

  // Mede o tempo até o primeiro paint útil (header + skeleton visível).
  useEffect(() => {
    requestAnimationFrame(() => {
      setRenderMs(Math.round(performance.now() - mountedAtRef.current));
    });
    // Prefetch idle de recursos secundários (wizard/drawer) —
    // primeiro clique fica instantâneo, sem inflar o bundle crítico.
    const idle = (cb: () => void) =>
      (window as unknown as { requestIdleCallback?: (fn: () => void) => number })
        .requestIdleCallback?.(cb) ?? window.setTimeout(cb, 800);
    idle(() => {
      void import("./novo-agendamento-wizard");
      void import("./patient-drawer");
      void import("./ai-insights-strip");
    });
  }, []);

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

  // Prefetch dos dias adjacentes (±1) em idle — troca de dia vira instantânea.
  useEffect(() => {
    if (!clinicaId || !agsQuery.isFetched) return;
    const idle = (cb: () => void) =>
      (window as unknown as { requestIdleCallback?: (fn: () => void) => number })
        .requestIdleCallback?.(cb) ?? window.setTimeout(cb, 300);
    const prefetchDay = (delta: number) => {
      const d = new Date(diaKey); d.setDate(d.getDate() + delta); d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      void queryClient.prefetchQuery({
        queryKey: ["agenda-v2", "ags", clinicaId, key],
        staleTime: 60 * 1000,
        queryFn: async () => {
          const start = new Date(key);
          const end = new Date(key); end.setHours(23, 59, 59, 999);
          const { data } = await supabase.from("agendamentos")
            .select("id,paciente_nome,paciente_id,medico_id,inicio,fim,procedimento,status,pacote_id,enfermagem_recurso_id,fluxo_etapa,fluxo_atualizado_em")
            .eq("clinica_id", clinicaId)
            .gte("inicio", start.toISOString())
            .lte("inicio", end.toISOString())
            .order("inicio", { ascending: true });
          return (data ?? []) as RawAg[];
        },
      });
    };
    idle(() => { prefetchDay(-1); prefetchDay(1); });
  }, [clinicaId, diaKey, agsQuery.isFetched, queryClient]);

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
      if (/dispon[íi]vel/i.test(s.paciente_nome ?? "")) return false;
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
      if (!/dispon[íi]vel/i.test(s.paciente_nome ?? "")) continue;
      const h = new Date(s.inicio).getHours();
      m.set(h, (m.get(h) ?? 0) + 1);
    }
    return m;
  }, [sessoes]);

  const drawerData = useMemo<DrawerPatientData | null>(() => {
    if (!drawerPacote || !rows) return null;
    const grupo = rows.filter((r) => (r.pacote_id ?? r.id) === drawerPacote);
    if (grupo.length === 0) return null;
    const primeiro = grupo[0];
    const medicoNome = primeiro.medico_id ? medicos.get(primeiro.medico_id) : null;
    const chegada = primeiro.fluxo_atualizado_em
      ? new Date(primeiro.fluxo_atualizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : null;
    const hora = new Date(primeiro.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    // Especialidade preferencial do médico (primeira do mapa).
    let especialidade: string | null = null;
    if (primeiro.medico_id && espData) {
      const set = espData.medToEsps.get(primeiro.medico_id);
      if (set && set.size > 0) {
        const espId = Array.from(set)[0];
        especialidade = espData.espMap.get(espId) ?? null;
      }
    }
    return {
      paciente_id: primeiro.paciente_id,
      paciente_nome: primeiro.paciente_nome,
      medico_nome: medicoNome ?? null,
      especialidade,
      status: primeiro.status ?? null,
      chegou_em: chegada,
      etapa_atual: primeiro.fluxo_etapa ?? "aguardando_recepcao",
      historico: primeiro.fluxo_atualizado_em
        ? [{ etapa: primeiro.fluxo_etapa ?? "aguardando_recepcao", timestamp: primeiro.fluxo_atualizado_em }]
        : [],
      proc_titulo: primeiro.procedimento,
      hora,
    };
  }, [drawerPacote, rows, medicos, espData]);

  const navDia = (delta: number) => {
    const d = new Date(dia); d.setDate(d.getDate() + delta); setDia(d);
  };

  const openDrawer = (id: string) => { setDrawerMounted(true); setDrawerPacote(id); };
  const compact = density === "compacto";
  const foco = density === "foco";

  // ==== Fase D · Atalhos de teclado (padrão Health Hub Pro) ====
  // F = Foco · C = Compacto · D = Confortável · J/K = próx/ant · Enter = abrir
  // Esc = fechar drawer · N = nova sessão · ? = ajuda · Ctrl/⌘+K = busca
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/⌘+K → foca busca (Busca Universal do módulo)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      // Esc fecha drawer (Dialog do drawer também trata, mas garantimos aqui)
      if (e.key === "Escape") {
        if (drawerPacote) { setDrawerPacote(null); return; }
      }
      if (isTypingTarget(e.target)) return;
      // "?" precisa de Shift em teclados US/BR — trata antes do filtro de modificadores.
      if (e.key === "?") { e.preventDefault(); setShortcutsOpen((v) => !v); return; }
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

      const k = e.key.toLowerCase();
      if (k === "f") { e.preventDefault(); setDensity("foco"); return; }
      if (k === "c") { e.preventDefault(); setDensity("compacto"); return; }
      if (k === "d") { e.preventDefault(); setDensity("confortavel"); return; }
      if (k === "n") { e.preventDefault(); setWizardOpen(true); return; }
      if (k === "j" || k === "k" || e.key === "Enter") {
        if (filtradas.length === 0) return;
        const idx = drawerPacote
          ? filtradas.findIndex((s) => s.pacote_id === drawerPacote)
          : -1;
        if (e.key === "Enter") {
          e.preventDefault();
          const target = idx >= 0 ? filtradas[idx] : filtradas[0];
          if (target) openDrawer(target.pacote_id);
          return;
        }
        e.preventDefault();
        let next = idx;
        if (k === "j") next = idx < 0 ? 0 : Math.min(filtradas.length - 1, idx + 1);
        if (k === "k") next = idx < 0 ? 0 : Math.max(0, idx - 1);
        const target = filtradas[next];
        if (target) openDrawer(target.pacote_id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtradas, drawerPacote]);

  // Feedback discreto ao trocar densidade via teclado.
  const setDensityWithToast = (d: SessionDensity) => {
    setDensity(d);
  };
  void setDensityWithToast;

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
    <div className="h-full flex bg-[#FAFAF8] overflow-hidden">
      {/* Sidebar operacional — visível em md+, vira Sheet no mobile (botão Painel no header) */}
      {!foco && !isMobile && (
        <Suspense fallback={<div className="hidden md:block w-64 border-r border-slate-100 bg-white" />}>
          <div className="hidden md:flex">
            <AgendaV2Sidebar
              clinicaNome={clinicaNome}
              dia={dia}
              sessoes={sessoes}
              recursos={recursosOcup}
              equipeOnline={equipeOnline}
            />
          </div>
        </Suspense>
      )}
      {!foco && isMobile && (
        <Sheet open={sidePanelOpen} onOpenChange={setSidePanelOpen}>
          <SheetContent side="left" className="p-0 w-[86vw] max-w-[320px] overflow-y-auto">
            <VisuallyHidden.Root>
              <SheetTitle>Painel da agenda</SheetTitle>
              <SheetDescription>Resumo do turno, sessões por tipo, recursos e equipe.</SheetDescription>
            </VisuallyHidden.Root>
            <Suspense fallback={<div className="w-full h-40 bg-white" />}>
              <AgendaV2Sidebar
                clinicaNome={clinicaNome}
                dia={dia}
                sessoes={sessoes}
                recursos={recursosOcup}
                equipeOnline={equipeOnline}
              />
            </Suspense>
          </SheetContent>
        </Sheet>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-100 bg-white/80 backdrop-blur-sm px-3 md:px-6 py-3 md:py-5 space-y-3 md:space-y-5 shrink-0">
        <div className="flex items-start justify-between gap-2 md:gap-4 flex-wrap">
          <div className="min-w-0 flex items-start gap-2">
            {!foco && isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl hover:bg-slate-100 shrink-0 md:hidden"
                onClick={() => setSidePanelOpen(true)}
                aria-label="Abrir painel"
              >
                <PanelLeft className="h-4 w-4 text-slate-500" />
              </Button>
            )}
            <div className="space-y-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 truncate">
              Agenda do Dia
            </h1>
            <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest text-slate-400 capitalize truncate">
              {format(dia, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => setWizardOpen(true)}
              className="h-9 px-4 rounded-2xl gap-1.5 bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-[1px]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="text-xs font-semibold hidden sm:inline">Nova sessão</span>
              <span className="text-xs font-semibold sm:hidden">Nova</span>
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
              <ToggleGroupItem value="foco" aria-label="Foco" className="h-8 w-8 rounded-xl data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <Focus className="h-3.5 w-3.5" />
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl hover:bg-slate-100 ml-1"
                onClick={() => setShortcutsOpen(true)}
                aria-label="Atalhos de teclado"
                title="Atalhos (?)"
              >
                <Keyboard className="h-4 w-4 text-slate-400" />
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
              ref={searchInputRef}
              className="pl-10 h-10 rounded-2xl bg-slate-100 border-transparent focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-slate-200 text-sm placeholder:text-slate-400 transition-colors duration-150"
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
              <span className="text-slate-400 tabular-nums">
                · query {loadedMs}ms{renderMs !== null && ` · render ${renderMs}ms`}
              </span>
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

      {/* Faixa de sugestões IA (visual) — recurso secundário, carrega depois */}
      {rows !== null && filtradas.length > 0 && (
        <Suspense fallback={null}>
          <AiInsightsStrip sessoes={filtradas} livresPorHora={livresPorHora} />
        </Suspense>
      )}

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
          <div className={cn(
            "h-full overflow-y-auto pb-8 transition-[padding] duration-200",
            foco ? "px-10 pt-6 max-w-4xl mx-auto" : "px-6 pt-4",
          )}>
            {porHora.map(([hora, lista]) => {
              const isNowHour = isToday && hora === nowHour;
              return (
                <div key={hora} className="flex gap-4 relative">
                  {/* Coluna de hora (régua) */}
                  <div className={cn("shrink-0 relative", foco ? "w-16" : "w-14")}>
                    <div className={cn(
                      "sticky top-0 tabular-nums pt-1",
                      foco ? "text-[13px] font-semibold text-slate-500" : "text-[11px] font-bold uppercase tracking-wider text-slate-400",
                    )}>
                      {String(hora).padStart(2, "0")}:00
                    </div>
                  </div>
                  {/* Coluna de sessões */}
                  <div className={cn("flex-1 min-w-0 border-l border-slate-100 pb-4 relative", foco ? "pl-8" : "pl-6")}>
                    {isNowHour && (
                      <div
                        className="absolute -left-[3px] right-0 flex items-center gap-2 z-10 pointer-events-none"
                        style={{ top: `${(nowMin / 60) * 100}%` }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: "rgba(79, 70, 229, 0.55)" }}
                        />
                        <span
                          className="flex-1 h-px"
                          style={{ background: "rgba(79, 70, 229, 0.35)" }}
                        />
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-500/70 pr-2">
                          agora · {String(nowHour).padStart(2, "0")}:{String(nowMin).padStart(2, "0")}
                        </span>
                      </div>
                    )}
                    <div className={cn(compact ? "space-y-1.5" : foco ? "space-y-4" : "space-y-2.5")}>
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
          <PatientDrawer
            open={!!drawerPacote}
            onOpenChange={(v) => { if (!v) setDrawerPacote(null); }}
            data={drawerData}
          />
        </Suspense>
      )}
      {wizardOpen && (
        <Suspense fallback={null}>
          <NovoAgendamentoWizard open={wizardOpen} onOpenChange={setWizardOpen} />
        </Suspense>
      )}

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">
              Atalhos de teclado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <ShortcutRow k="?" label="Abrir / fechar este painel" />
            <div className="border-t border-slate-100" />
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Modos de visualização</div>
            <ShortcutRow k="D" label="Confortável" />
            <ShortcutRow k="C" label="Compacto" />
            <ShortcutRow k="F" label="Foco" />
            <div className="border-t border-slate-100" />
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Navegação</div>
            <ShortcutRow k="J" label="Próxima sessão" />
            <ShortcutRow k="K" label="Sessão anterior" />
            <ShortcutRow k="Enter" label="Abrir sessão selecionada" />
            <ShortcutRow k="Esc" label="Fechar drawer" />
            <div className="border-t border-slate-100" />
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ações</div>
            <ShortcutRow k="N" label="Nova sessão" />
            <ShortcutRow k="Ctrl K" label="Focar busca do módulo" />
          </div>
          <p className="text-[11px] text-slate-400 pt-2">
            Padrão Health Hub Pro — reutilizado em Caixa, Clientes, Orçamentos e Prontuário.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShortcutRow({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-mono text-slate-700">
        {k}
      </kbd>
    </div>
  );
}