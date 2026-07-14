import type { ReactNode } from "react";
import { CalendarX2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgendaEmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function AgendaEmptyState({
  title = "Nenhum agendamento encontrado",
  description = "Ajuste os filtros ou tente uma nova pesquisa para encontrar o que procura.",
  action, icon, className,
}: AgendaEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-14 gap-3",
        className,
      )}
    >
      <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
        {icon ?? <CalendarX2 className="h-6 w-6" />}
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}