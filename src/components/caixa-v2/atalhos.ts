import { useEffect } from "react";

export interface CaixaShortcuts {
  onReceber?: () => void;   // F2
  onImprimir?: () => void;  // F3
  onDespesa?: () => void;   // F4
  onEscape?: () => void;    // Esc
  enabled?: boolean;
}

/** Atalhos globais do Caixa v2. Ignora quando input/textarea está focado
 *  (exceto Esc, que sempre passa). */
export function useCaixaShortcuts({ onReceber, onImprimir, onDespesa, onEscape, enabled = true }: CaixaShortcuts) {
  useEffect(() => {
    if (!enabled) return;
    const isTypingTarget = (el: EventTarget | null): boolean => {
      const n = el as HTMLElement | null;
      if (!n) return false;
      const tag = n.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || n.isContentEditable === true;
    };
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onEscape?.(); return; }
      if (isTypingTarget(e.target)) return;
      if (e.key === "F2" && onReceber)   { e.preventDefault(); onReceber(); }
      else if (e.key === "F3" && onImprimir) { e.preventDefault(); onImprimir(); }
      else if (e.key === "F4" && onDespesa)  { e.preventDefault(); onDespesa(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [enabled, onReceber, onImprimir, onDespesa, onEscape]);
}