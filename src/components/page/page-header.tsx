import { Fragment, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pill discreta usada em breadcrumbs/tags do cabeçalho. */
export function PageTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Trilha de etapas (pills separadas por chevron), como no Fluxo do paciente. */
export function PageBreadcrumb({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((item, i) => (
        <Fragment key={i}>
          <PageTag>{item}</PageTag>
          {i < items.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
        </Fragment>
      ))}
    </div>
  );
}

interface PageHeaderProps {
  /** Ícone da página (lucide já dimensionado pelo header). */
  icon?: ReactNode;
  title: ReactNode;
  /** Contagem/《badge》discreta ao lado do título (ex.: "252.477 pacientes"). */
  meta?: ReactNode;
  description?: ReactNode;
  /** Pills/breadcrumb opcionais abaixo do título (ex.: <PageBreadcrumb items={[...]} />). */
  breadcrumb?: ReactNode;
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
  breadcrumb,
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
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 [&_svg]:h-[18px] [&_svg]:w-[18px]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-baseline gap-2 truncate text-xl font-bold tracking-tight text-slate-900">
            <span className="truncate">{title}</span>
            {meta && (
              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">{meta}</span>
            )}
          </h1>
          {description && (
            <p className="mt-0.5 hidden truncate text-xs font-medium text-slate-500 lg:block">{description}</p>
          )}
          {breadcrumb && <div className="mt-1.5 hidden sm:block">{breadcrumb}</div>}
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