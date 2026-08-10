import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Ícone da página (lucide já dimensionado pelo header). */
  icon?: ReactNode;
  title: ReactNode;
  /** Contagem/《badge》discreta ao lado do título (ex.: "252.477 pacientes"). */
  meta?: ReactNode;
  description?: ReactNode;
  /** Ação principal — sempre a mais à direita e com peso visual maior. */
  primaryAction?: ReactNode;
  /** Ações secundárias — peso visual menor, agrupadas antes da principal. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão de página do ClinicaOS.
 *
 * Regras do padrão global de UI:
 *  - uma única ação principal por página (destaque real);
 *  - ações secundárias com peso menor, agrupadas;
 *  - título trunca em telas estreitas (nunca empurra as ações para fora);
 *  - descrição só aparece a partir de `lg` (não gasta altura no mobile).
 */
export function PageHeader({
  icon,
  title,
  meta,
  description,
  primaryAction,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-baseline gap-2 truncate text-xl font-semibold tracking-tight">
            <span className="truncate">{title}</span>
            {meta && (
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{meta}</span>
            )}
          </h1>
          {description && (
            <p className="hidden truncate text-xs text-muted-foreground lg:block">{description}</p>
          )}
        </div>
      </div>

      {(actions || primaryAction) && (
        <div className="col-span-2 flex shrink-0 flex-wrap items-center gap-1.5 sm:col-span-1">
          {actions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}

/**
 * Faixa de filtros padrão: fundo de cartão, campos em grade responsiva
 * e rótulos pequenos em maiúsculas.
 */
export function PageFilters({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3 shadow-xs", className)}>
      {children}
    </div>
  );
}