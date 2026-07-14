import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader — Cabeçalho de módulo estilo SaaS premium.
 * Título grande + subtítulo à esquerda; slot de ações à direita.
 */
export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between md:gap-6",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl md:text-[26px] font-semibold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}