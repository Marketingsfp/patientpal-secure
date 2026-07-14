import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionToolbarProps {
  primary?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}

/**
 * ActionToolbar — agrupa ações primárias (ex. Adicionar Encaixe, Agenda Express)
 * e secundárias (Exportar, Opções…) com hierarquia visual clara.
 */
export function ActionToolbar({ primary, secondary, className }: ActionToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className,
      )}
    >
      {secondary && (
        <div className="flex flex-wrap items-center gap-1.5 pr-1 border-r border-border/60">
          {secondary}
        </div>
      )}
      {primary && (
        <div className="flex flex-wrap items-center gap-2">
          {primary}
        </div>
      )}
    </div>
  );
}