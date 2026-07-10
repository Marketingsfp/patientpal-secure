import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickFilterOption<V extends string = string> {
  value: V;
  label: string;
  count?: number;
}

interface QuickFiltersProps<V extends string> {
  options: ReadonlyArray<QuickFilterOption<V>>;
  value: V[];
  onChange: (next: V[]) => void;
  multi?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Chips de filtro rápido. Estado controlado pelo pai (idealmente URL search params).
 * multi=true permite múltipla seleção; senão, comportamento radio.
 */
export function QuickFilters<V extends string>({
  options,
  value,
  onChange,
  multi = false,
  className,
  ariaLabel = "Filtros rápidos",
}: QuickFiltersProps<V>) {
  const toggle = (v: V) => {
    if (!multi) {
      onChange(value.includes(v) ? [] : [v]);
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  const hasAny = value.length > 0;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0 text-[10px] tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {opt.count.toLocaleString("pt-BR")}
              </span>
            )}
          </button>
        );
      })}
      {hasAny && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Limpar filtros"
        >
          <X className="h-3 w-3" /> Limpar
        </button>
      )}
    </div>
  );
}
