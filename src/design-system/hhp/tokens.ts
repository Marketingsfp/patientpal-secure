/**
 * Health Hub Pro — Design System
 * Tokens em TS espelham os tokens CSS (src/styles.css) para uso em lógica
 * (ex.: durações de motion, thresholds de densidade). Cores só via CSS.
 */

export const HHP_MOTION = {
  ease: "cubic-bezier(0.32, 0.72, 0, 1)",
  durFast: 120,
  durBase: 180,
  durSlow: 260,
} as const;

export type HhpDensity = "confortavel" | "compacto" | "foco";

export const HHP_DENSITY_GAP: Record<HhpDensity, string> = {
  confortavel: "space-y-2.5",
  compacto: "space-y-1.5",
  foco: "space-y-4",
};

export const HHP_DENSITY_CARD_PAD: Record<HhpDensity, string> = {
  confortavel: "p-4",
  compacto: "p-2.5",
  foco: "p-5",
};

export type HhpTone = "default" | "info" | "ok" | "warn" | "danger" | "focus";

export const HHP_TONE_BG: Record<HhpTone, string> = {
  default: "bg-slate-100 text-slate-500",
  info: "bg-blue-100 text-blue-600",
  ok: "bg-emerald-100 text-emerald-600",
  warn: "bg-amber-100 text-amber-600",
  danger: "bg-rose-100 text-rose-600",
  focus: "bg-indigo-100 text-indigo-600",
};

export const HHP_TONE_TEXT: Record<HhpTone, string> = {
  default: "text-slate-500",
  info: "text-blue-600",
  ok: "text-emerald-600",
  warn: "text-amber-600",
  danger: "text-rose-600",
  focus: "text-indigo-600",
};

/** Atalhos de teclado padrão do Health Hub Pro (para reuso entre módulos). */
export const HHP_SHORTCUTS = [
  { group: "Modos", items: [
    { k: "D", label: "Modo confortável" },
    { k: "C", label: "Modo compacto" },
    { k: "F", label: "Modo foco" },
  ]},
  { group: "Navegação", items: [
    { k: "J", label: "Próximo item" },
    { k: "K", label: "Item anterior" },
    { k: "Enter", label: "Abrir item selecionado" },
    { k: "Esc", label: "Fechar drawer / cancelar" },
  ]},
  { group: "Ações", items: [
    { k: "N", label: "Novo (contexto da tela)" },
    { k: "Ctrl K", label: "Focar busca do módulo" },
    { k: "?", label: "Abrir este painel" },
  ]},
] as const;