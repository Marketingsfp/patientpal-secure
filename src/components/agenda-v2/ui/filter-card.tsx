import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterCardProps {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * FilterCard — Card único "Filtros" com grid responsivo.
 * Uso: envolver `<FilterField>`s e opcionalmente `<FilterActions>` no final.
 */
export function FilterCard({ title = "Filtros", children, actions, className }: FilterCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <header className="flex items-center gap-2 px-4 md:px-5 pt-4">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </header>
      <div className="p-4 md:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {children}
        </div>
        {actions && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}

interface FilterFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  span?: 1 | 2 | 3 | 4;
}

const SPAN_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "",
  2: "sm:col-span-2",
  3: "sm:col-span-2 lg:col-span-3",
  4: "sm:col-span-2 lg:col-span-4",
};

export function FilterField({ label, htmlFor, hint, children, className, span = 1 }: FilterFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", SPAN_CLASS[span], className)}>
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function FilterActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}