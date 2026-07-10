import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * HhpPageHeader — Cabeçalho padrão de módulos Health Hub Pro.
 * Título editorial + eyebrow (uppercase, tracking wide) + slots.
 */
export interface HhpPageHeaderProps {
  title: string;
  eyebrow?: React.ReactNode;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function HhpPageHeader({
  title,
  eyebrow,
  leading,
  actions,
  children,
  className,
}: HhpPageHeaderProps) {
  return (
    <div
      className={cn(
        "border-b border-slate-100 bg-white/80 backdrop-blur-sm px-3 md:px-6 py-3 md:py-5 space-y-3 md:space-y-5 shrink-0",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 md:gap-4 flex-wrap">
        <div className="min-w-0 flex items-start gap-2">
          {leading}
          <div className="space-y-1 min-w-0">
            <h1
              className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 truncate"
              style={{ fontFamily: "var(--hhp-font-display)", letterSpacing: "-0.015em" }}
            >
              {title}
            </h1>
            {eyebrow && (
              <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest text-slate-400 capitalize truncate">
                {eyebrow}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
