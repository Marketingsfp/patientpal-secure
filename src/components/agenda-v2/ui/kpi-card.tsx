import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type KpiTone = "default" | "info" | "success" | "warn" | "danger";

const TONE_BG: Record<KpiTone, string> = {
  default: "bg-slate-100 text-slate-700",
  info: "bg-blue-50 text-blue-600",
  success: "bg-emerald-50 text-emerald-600",
  warn: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600",
};

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: KpiTone;
  hint?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * KpiCard — Cartão de KPI padrão SaaS: ícone tonalizado, número grande tabular,
 * label discreto e hover-lift sutil. Clicável opcionalmente.
 */
export function KpiCard({ label, value, icon: Icon, tone = "default", hint, active, onClick, className }: KpiCardProps) {
  const Comp: "button" | "div" = onClick ? "button" : "div";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("min-w-0", className)}
    >
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        aria-pressed={onClick ? !!active : undefined}
        className={cn(
          "group relative w-full text-left rounded-2xl border bg-card p-4 md:p-5 transition-all",
          "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          onClick && "hover:-translate-y-[1px] hover:shadow-[0_8px_24px_-14px_rgba(15,23,42,0.18)] cursor-pointer",
          active ? "border-primary ring-2 ring-primary/15" : "border-border",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", TONE_BG[tone])}>
            <Icon className="h-4 w-4" strokeWidth={2.2} />
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5 min-w-0">
          <span className="tabular-nums font-semibold text-2xl md:text-3xl text-foreground truncate">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </span>
        </div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground truncate">{hint}</div>
        )}
      </Comp>
    </motion.div>
  );
}

export function KpiRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
}