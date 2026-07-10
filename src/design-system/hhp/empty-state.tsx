import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HhpEmptyState — Estado vazio padrão do Health Hub Pro.
 * Ícone grande de baixo peso + título + descrição + CTA opcional.
 */
export interface HhpEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function HhpEmptyState({ icon: Icon, title, description, action, className }: HhpEmptyStateProps) {
  return (
    <div className={cn("h-full flex flex-col items-center justify-center text-center p-6 gap-3", className)}>
      <Icon className="h-12 w-12 text-slate-300" strokeWidth={1.5} />
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {description && (
        <div className="text-xs text-slate-500 max-w-sm">{description}</div>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}