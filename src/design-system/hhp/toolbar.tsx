import * as React from "react";
import { cn } from "@/lib/utils";

/** HhpToolbar — linha de filtros/busca; wrap responsivo com gaps consistentes. */
export function HhpToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 md:gap-3 flex-wrap", className)}>{children}</div>
  );
}

/** Container "pill" para ToggleGroup segmentado (densidade, view mode). */
export function HhpToolbarPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-slate-100 p-1 rounded-2xl inline-flex", className)}>{children}</div>
  );
}
