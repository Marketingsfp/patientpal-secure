import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ResponsiveCards — pattern helper para transformar tabelas em cards
 * empilhados no mobile (< md), mantendo a tabela original no desktop.
 *
 * Uso:
 * ```tsx
 * <ResponsiveCards
 *   items={pacientes}
 *   getKey={(p) => p.id}
 *   renderCard={(p) => (
 *     <MobileCardRow label="Nome" value={p.nome} />
 *     <MobileCardRow label="CPF" value={p.cpf} />
 *   )}
 *   onItemClick={(p) => openDrawer(p)}
 *   desktop={<TabelaOriginal items={pacientes} />}
 * />
 * ```
 *
 * O componente resolve o breakpoint via CSS (`hidden md:block` / `md:hidden`),
 * então funciona em SSR sem flash.
 */
export interface ResponsiveCardsProps<T> {
  items: ReadonlyArray<T>;
  getKey: (item: T, index: number) => string | number;
  renderCard: (item: T, index: number) => React.ReactNode;
  onItemClick?: (item: T, index: number) => void;
  /** Tabela/grid do desktop — renderizado a partir de md+. */
  desktop: React.ReactNode;
  /** Estado vazio (aplicado apenas no mobile). */
  empty?: React.ReactNode;
  /** Loading placeholder no mobile. */
  loading?: boolean;
  loadingCount?: number;
  className?: string;
  cardClassName?: string;
}

export function ResponsiveCards<T>({
  items, getKey, renderCard, onItemClick, desktop,
  empty, loading, loadingCount = 4, className, cardClassName,
}: ResponsiveCardsProps<T>) {
  return (
    <>
      {/* Desktop: mantém tabela/grid original */}
      <div className={cn("hidden md:block", className)}>{desktop}</div>

      {/* Mobile: lista de cards empilhados */}
      <div className={cn("md:hidden space-y-2", className)}>
        {loading ? (
          Array.from({ length: loadingCount }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-3 animate-pulse h-24"
            />
          ))
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            {empty ?? "Nada por aqui ainda."}
          </div>
        ) : (
          items.map((item, i) => {
            const key = getKey(item, i);
            const Comp = onItemClick ? "button" : "div";
            return (
              <Comp
                key={key}
                type={onItemClick ? "button" : undefined}
                onClick={onItemClick ? () => onItemClick(item, i) : undefined}
                className={cn(
                  "w-full text-left rounded-xl border border-border bg-card p-3 shadow-sm",
                  onItemClick && "active:bg-muted/60 transition-colors",
                  cardClassName,
                )}
              >
                {renderCard(item, i)}
              </Comp>
            );
          })
        )}
      </div>
    </>
  );
}

/** Linha rótulo/valor dentro de um card mobile. */
export function MobileCardRow({
  label, value, className,
}: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 min-w-0", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground text-right min-w-0 truncate">
        {value}
      </span>
    </div>
  );
}

/** Cabeçalho do card mobile — título + ação/status à direita. */
export function MobileCardHeader({
  title, right, subtitle, className,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-2 mb-1", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}