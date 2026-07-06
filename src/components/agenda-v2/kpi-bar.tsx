import { cn } from "@/lib/utils";
import { Clock, Activity, CheckCircle2, XCircle, TestTube, Users, type LucideIcon } from "lucide-react";

export interface Kpi {
  key: string;
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger" | "ok" | "info";
  hint?: string;
  delta?: number;
}

const ICONS: Record<string, LucideIcon> = {
  todos: Users,
  agendado: Clock,
  confirmado: CheckCircle2,
  realizado: Activity,
  cancelado: XCircle,
  lab: TestTube,
};

const TONE_TEXT: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "text-slate-500",
  warn: "text-amber-600",
  danger: "text-rose-600",
  ok: "text-emerald-600",
  info: "text-blue-600",
};

const TONE_BG: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "bg-slate-100 text-slate-500",
  warn: "bg-amber-100 text-amber-600",
  danger: "bg-rose-100 text-rose-600",
  ok: "bg-emerald-100 text-emerald-600",
  info: "bg-blue-100 text-blue-600",
};

/**
 * KPIs em CARDS (padrão mockup V3): rótulo pequeno uppercase, número grande,
 * ícone no canto direito com fundo tonalizado. Todo o card é clicável.
 */
export function KpiBar({
  items,
  activeKey,
  onSelect,
  compact = false,
}: {
  items: ReadonlyArray<Kpi>;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-3 md:grid-cols-6" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6")}>
      {items.map((k) => {
        const tone = k.tone ?? "default";
        const active = activeKey === k.key;
        const Icon = ICONS[k.key] ?? Activity;
        return (
          <button
            key={k.key}
            type="button"
            onClick={() => onSelect?.(k.key)}
            title={k.hint ?? k.label}
            className={cn(
              "group text-left rounded-2xl border bg-white transition-all",
              "hover:shadow-md hover:-translate-y-[1px] hover:border-slate-200",
              compact ? "p-3" : "p-4",
              active ? "border-slate-900 shadow-sm ring-1 ring-slate-900/5" : "border-slate-100",
            )}
            aria-pressed={active}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {k.label}
              </span>
              <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-lg", TONE_BG[tone])}>
                <Icon className="h-3 w-3" strokeWidth={2.5} />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={cn("tabular-nums font-bold text-slate-900", compact ? "text-xl" : "text-3xl")}>
                {k.value.toLocaleString("pt-BR")}
              </span>
              {k.delta !== undefined && k.delta !== 0 && (
                <span className={cn("text-[10px] font-semibold tabular-nums", k.delta > 0 ? TONE_TEXT[tone] : "text-slate-400")}>
                  {k.delta > 0 ? "+" : ""}{k.delta}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}