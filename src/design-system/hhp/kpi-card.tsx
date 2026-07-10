import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { HHP_TONE_BG, HHP_TONE_TEXT, type HhpTone } from "./tokens";

/**
 * HhpKpiCard — Card de KPI padrão Health Hub Pro.
 * Rótulo uppercase minúsculo, valor grande tabular, ícone tonalizado à direita
 * e opcional delta comparativo. Todo o card é clicável (aria-pressed).
 */
export interface HhpKpiCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  tone?: HhpTone;
  hint?: string;
  delta?: number;
  active?: boolean;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

export function HhpKpiCard({
  label,
  value,
  icon: Icon = Activity,
  tone = "default",
  hint,
  delta,
  active,
  compact = false,
  onClick,
  className,
}: HhpKpiCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={hint ?? label}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        "group relative text-left rounded-2xl border bg-white transition-all shrink-0 overflow-hidden",
        "min-w-[8.5rem] md:min-w-0",
        onClick && "hover:shadow-[0_10px_28px_-16px_rgba(15,23,42,0.20)] hover:-translate-y-[1px] hover:border-slate-200 cursor-pointer",
        compact ? "p-3" : "p-4",
        active
          ? "border-[var(--clinic-accent)] shadow-sm ring-2 ring-[color:var(--clinic-accent-glow)]"
          : "border-slate-100",
        className,
      )}
    >
      {/* Barra de accent no topo — quase invisível em repouso, "acende" no active */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[2px] transition-opacity",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        )}
        style={{ background: "var(--clinic-accent)" }}
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <span
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-lg",
            HHP_TONE_BG[tone],
          )}
        >
          <Icon className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn("tabular-nums font-bold text-slate-900", compact ? "text-xl" : "text-3xl")}
        >
          {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
        </span>
        {delta !== undefined && delta !== 0 && (
          <span
            className={cn(
              "text-[10px] font-semibold tabular-nums",
              delta > 0 ? HHP_TONE_TEXT[tone] : "text-slate-400",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
    </Comp>
  );
}

/** Grade responsiva de KPIs com scroll horizontal no mobile e grid ≥ md. */
export function HhpKpiRow({
  children,
  compact = false,
  className,
}: {
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 pb-1 md:mx-0 md:px-0 md:pb-0",
        "md:grid",
        compact ? "md:grid-cols-6" : "md:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
