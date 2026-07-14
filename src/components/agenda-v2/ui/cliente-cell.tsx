import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ClienteCellProps {
  nome: ReactNode;
  secondary?: ReactNode;
  leading?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Célula de Cliente: nome em destaque, subtítulo em muted. */
export function ClienteCell({ nome, secondary, leading, onClick, className }: ClienteCellProps) {
  const inner = (
    <div className="flex items-center gap-2 min-w-0">
      {leading}
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{nome}</div>
        {secondary && (
          <div className="text-xs text-muted-foreground truncate">{secondary}</div>
        )}
      </div>
    </div>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn("text-left w-full min-w-0 hover:text-primary transition-colors", className)}
      >
        {inner}
      </button>
    );
  }
  return <div className={cn("min-w-0", className)}>{inner}</div>;
}