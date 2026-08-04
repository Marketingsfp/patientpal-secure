import { useState } from "react";
import {
  Plus, Zap, List, Stethoscope, LogOut, Rocket, Printer, RefreshCw,
  User, Users, Calendar as CalendarIcon, Search, Filter, Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface AgendaFiltersValue {
  profissional: string;
  cliente: string;
  servico: string;
  dataRef: string;
  ficha: string;
  apenasDataSelecionada: boolean;
}

export const AGENDA_FILTERS_EMPTY: AgendaFiltersValue = {
  profissional: "", cliente: "", servico: "", dataRef: "", ficha: "",
  apenasDataSelecionada: false,
};

export interface AgendaHeaderFiltersProps {
  subtitle?: string;
  value?: AgendaFiltersValue;
  onChange?: (v: AgendaFiltersValue) => void;
  onSubmit?: (v: AgendaFiltersValue) => void;
  onClear?: () => void;
  onAddEncaixe?: () => void;
  onEncerrarExpediente?: () => void;
  onAgendaExpress?: () => void;
  onImprimir?: () => void;
  onAtualizar?: () => void;
  viewMode?: "lista" | "medico";
  onViewModeChange?: (v: "lista" | "medico") => void;
  turbo?: boolean;
  onTurboChange?: (v: boolean) => void;
  className?: string;
}

function Campo({
  label, icon: Icon, children,
}: { label: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
        )}
        <div className={cn(Icon && "[&_input]:pl-9")}>{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  "h-10 rounded-lg border-slate-200 bg-white text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40";

/**
 * AgendaHeaderFilters — cabeçalho, barra de ações compacta e card de filtros
 * premium da tela de Agendas. Componente isolado e controlado (opcional).
 */
export function AgendaHeaderFilters({
  subtitle = "Gerencie os agendamentos da clínica por profissional, serviço e período.",
  value, onChange, onSubmit, onClear, onAddEncaixe, onEncerrarExpediente,
  onAgendaExpress, onImprimir, onAtualizar,
  viewMode: viewModeProp, onViewModeChange,
  turbo: turboProp, onTurboChange, className,
}: AgendaHeaderFiltersProps) {
  const [innerValue, setInnerValue] = useState<AgendaFiltersValue>(AGENDA_FILTERS_EMPTY);
  const [innerView, setInnerView] = useState<"lista" | "medico">("lista");
  const [innerTurbo, setInnerTurbo] = useState(false);

  const v = value ?? innerValue;
  const viewMode = viewModeProp ?? innerView;
  const turbo = turboProp ?? innerTurbo;

  const set = (patch: Partial<AgendaFiltersValue>) => {
    const next = { ...v, ...patch };
    if (onChange) onChange(next); else setInnerValue(next);
  };
  const setView = (m: "lista" | "medico") => {
    if (onViewModeChange) onViewModeChange(m); else setInnerView(m);
  };
  const setTurbo = (t: boolean) => {
    if (onTurboChange) onTurboChange(t); else setInnerTurbo(t);
  };
  const clear = () => {
    if (onClear) onClear();
    if (!value) setInnerValue(AGENDA_FILTERS_EMPTY);
  };

  return (
    <div className={cn("space-y-5", className)}>
      {/* Cabeçalho */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">Agendas</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Button
          onClick={onAddEncaixe}
          className="shrink-0 h-10 rounded-lg shadow-md shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          Adicionar Encaixe
        </Button>
      </header>

      {/* Barra de ações compacta */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={turbo ? "default" : "outline"}
          className="h-8 rounded-lg gap-1.5 text-xs"
          onClick={() => setTurbo(!turbo)}
        >
          <Zap className={cn("h-3.5 w-3.5", !turbo && "opacity-70")} />
          Turbo {turbo ? "ON" : "OFF"}
        </Button>

        {/* Segmented control */}
        <div
          role="group"
          aria-label="Modo de visualização"
          className="inline-flex items-center rounded-lg bg-slate-100 p-0.5"
        >
          {([
            { key: "lista" as const, label: "Lista", icon: List },
            { key: "medico" as const, label: "Por médico", icon: Stethoscope },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={viewMode === key}
              onClick={() => setView(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[7px] px-3 h-7 text-xs font-medium transition-colors",
                viewMode === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />

        <Button size="sm" variant="ghost" className="h-8 rounded-lg gap-1.5 text-xs text-slate-600" onClick={onEncerrarExpediente}>
          <LogOut className="h-3.5 w-3.5" />
          Encerrar expediente
        </Button>
        <Button size="sm" variant="ghost" className="h-8 rounded-lg gap-1.5 text-xs text-slate-600" onClick={onAgendaExpress}>
          <Rocket className="h-3.5 w-3.5" />
          Agenda Express
        </Button>
        <Button size="sm" variant="ghost" className="h-8 rounded-lg gap-1.5 text-xs text-slate-600" onClick={onImprimir}>
          <Printer className="h-3.5 w-3.5" />
          Imprimir
        </Button>
        <Button size="sm" variant="ghost" className="h-8 rounded-lg gap-1.5 text-xs text-slate-600" onClick={onAtualizar}>
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      {/* Card de filtros */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="h-[3px] w-full bg-primary/80" aria-hidden />
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <Filter className="h-4 w-4 text-slate-400" aria-hidden />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Filtros da agenda
          </h2>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit?.(v); }}
          className="p-5 md:p-6"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 lg:grid-cols-5">
            <Campo label="Profissional" icon={Stethoscope}>
              <Input
                className={inputCls}
                placeholder="Todos"
                value={v.profissional}
                onChange={(e) => set({ profissional: e.target.value })}
              />
            </Campo>
            <Campo label="Cliente" icon={User}>
              <Input
                className={inputCls}
                placeholder="Nome do paciente"
                value={v.cliente}
                onChange={(e) => set({ cliente: e.target.value })}
              />
            </Campo>
            <Campo label="Serviço" icon={Users}>
              <Input
                className={inputCls}
                placeholder="Todos os serviços"
                value={v.servico}
                onChange={(e) => set({ servico: e.target.value })}
              />
            </Campo>
            <Campo label="Data ref." icon={CalendarIcon}>
              <Input
                type="date"
                className={inputCls}
                value={v.dataRef}
                onChange={(e) => set({ dataRef: e.target.value })}
              />
            </Campo>
            <Campo label="Ficha" icon={Search}>
              <Input
                className={inputCls}
                placeholder="Nº da ficha"
                value={v.ficha}
                onChange={(e) => set({ ficha: e.target.value })}
              />
            </Campo>
          </div>

          <div className="mt-2 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Checkbox
                checked={v.apenasDataSelecionada}
                onCheckedChange={(c) => set({ apenasDataSelecionada: c === true })}
              />
              Exibir apenas a data selecionada
            </label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-9 rounded-lg gap-1.5 text-slate-600" onClick={clear}>
                <Eraser className="h-4 w-4" />
                Limpar
              </Button>
              <Button type="submit" size="sm" className="h-9 rounded-lg gap-1.5 shadow-md shadow-primary/20">
                <Search className="h-4 w-4" />
                Exibir
              </Button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}