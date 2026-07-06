import { cn } from "@/lib/utils";

export interface Kpi {
  key: string;
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger" | "ok" | "info";
  hint?: string;
}

// Bolinha colorida discreta + número em destaque + rótulo sutil.
// Sem cor de fundo forte — pill limpa com contorno leve; realce apenas no ativo.
const DOT: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "bg-slate-400",
  warn: "bg-amber-500",
  danger: "bg-rose-500",
  ok: "bg-emerald-500",
  info: "bg-sky-500",
};

const ACTIVE_RING: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "ring-2 ring-slate-400/60 border-slate-300",
  warn: "ring-2 ring-amber-400/60 border-amber-300",
  danger: "ring-2 ring-rose-400/60 border-rose-300",
  ok: "ring-2 ring-emerald-400/60 border-emerald-300",
  info: "ring-2 ring-sky-400/60 border-sky-300",
};

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
    <div className={cn("flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
      {items.map((k) => {
        const tone = k.tone ?? "default";
        const active = activeKey === k.key;
        return (
          <button
            key={k.key}
            type="button"
            onClick={() => onSelect?.(k.key)}
            title={k.hint ?? k.label}
            className={cn(
              "group flex items-center gap-2 rounded-full border bg-card/60 backdrop-blur-sm",
              "transition-all hover:bg-card hover:shadow-sm hover:-translate-y-[1px]",
              compact ? "px-2.5 py-1" : "px-3.5 py-1.5",
              active ? ACTIVE_RING[tone] : "border-border/60",
            )}
            aria-pressed={active}
          >
            <span className={cn("h-2 w-2 rounded-full shrink-0", DOT[tone])} />
            <span className={cn("font-semibold tabular-nums text-foreground", compact ? "text-sm" : "text-base leading-none")}>
              {k.value.toLocaleString("pt-BR")}
            </span>
            <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
              {k.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}