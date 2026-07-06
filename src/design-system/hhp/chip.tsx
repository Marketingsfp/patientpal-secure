import * as React from "react";
import { cn } from "@/lib/utils";
import { HHP_TONE_BG, type HhpTone } from "./tokens";

/**
 * HhpChip — Chip semântico do Health Hub Pro.
 * Pequeno, com ponto colorido opcional e tom pré-definido. Usado em cards,
 * headers e drawers para status, categorias e metadados.
 */
export interface HhpChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: HhpTone;
  dot?: boolean;
  size?: "sm" | "md";
}

export function HhpChip({
  tone = "default",
  dot = false,
  size = "sm",
  className,
  children,
  ...rest
}: HhpChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium tabular-nums",
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
        HHP_TONE_BG[tone],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "default" ? "bg-slate-400" :
            tone === "info" ? "bg-blue-500" :
            tone === "ok" ? "bg-emerald-500" :
            tone === "warn" ? "bg-amber-500" :
            tone === "danger" ? "bg-rose-500" : "bg-indigo-500",
          )}
        />
      )}
      {children}
    </span>
  );
}