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
  info: "bg-blue-500",
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
    <div className={cn("inline-flex flex-wrap items-center rounded-2xl bg-slate-100 p-1.5", compact ? "gap-0.5" : "gap-1")}>
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
              "group flex items-center gap-2 rounded-xl transition-all",
              compact ? "px-2.5 py-1.5" : "px-3.5 py-2",
              active
                ? "bg-white shadow-sm text-slate-800 font-semibold"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/50 font-medium",
            )}
            aria-pressed={active}
          >
            <span className={cn("h-2 w-2 rounded-full shrink-0", DOT[tone])} />
            <span className={cn("tabular-nums font-semibold text-slate-800", compact ? "text-xs" : "text-sm")}>
              {k.value.toLocaleString("pt-BR")}
            </span>
            <span className={cn(compact ? "text-[11px]" : "text-xs")}>
              {k.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}