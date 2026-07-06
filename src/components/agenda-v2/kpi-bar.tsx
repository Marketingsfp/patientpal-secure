import { cn } from "@/lib/utils";

export interface Kpi {
  key: string;
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger" | "ok";
}

const TONE: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "bg-muted text-foreground",
  warn: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-900",
  ok: "bg-emerald-100 text-emerald-900",
};

export function KpiBar({
  items, activeKey, onSelect,
}: {
  items: ReadonlyArray<Kpi>;
  activeKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((k) => {
        const active = activeKey === k.key;
        return (
          <button
            key={k.key}
            type="button"
            onClick={() => onSelect?.(k.key)}
            className={cn(
              "px-3 py-1.5 rounded-md border text-xs flex items-center gap-2 transition-colors",
              TONE[k.tone ?? "default"],
              active ? "ring-2 ring-primary" : "hover:opacity-80",
            )}
          >
            <span className="opacity-80">{k.label}</span>
            <span className="font-semibold tabular-nums">{k.value.toLocaleString("pt-BR")}</span>
          </button>
        );
      })}
    </div>
  );
}