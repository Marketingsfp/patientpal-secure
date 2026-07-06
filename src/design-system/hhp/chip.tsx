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
  size?: "xs" | "sm" | "md";
  /**
   * "solid" (default) usa o tom cheio (tone-100 bg).
   * "outline" usa fundo suave + borda + texto mais forte (tone-50 / tone-200 / tone-700),
   * compatível com o visual histórico da Agenda V2.
   */
  variant?: "solid" | "outline";
  radius?: "full" | "md";
}

const OUTLINE_BG: Record<HhpTone, string> = {
  default: "bg-slate-50 text-slate-700 border border-slate-200",
  info: "bg-blue-50 text-blue-700 border border-blue-100",
  ok: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  warn: "bg-amber-50 text-amber-700 border border-amber-200/60",
  danger: "bg-rose-50 text-rose-700 border border-rose-100",
  focus: "bg-indigo-50 text-indigo-700 border border-indigo-100",
};

export function HhpChip({
  tone = "default",
  dot = false,
  size = "sm",
  variant = "solid",
  radius = "full",
  className,
  children,
  ...rest
}: HhpChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium tabular-nums",
        radius === "full" ? "rounded-full" : "rounded-md",
        size === "xs"
          ? "text-[10px] px-1.5 py-0.5 gap-1"
          : size === "sm"
          ? "text-[11px] px-2 py-0.5 gap-1.5"
          : "text-xs px-2.5 py-1 gap-1.5",
        variant === "outline" ? OUTLINE_BG[tone] : HHP_TONE_BG[tone],
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