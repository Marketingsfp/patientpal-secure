import { useEffect, useState } from "react";

const KEY = "recepcao:turbo-mode";
const EVT = "turbo-mode-change";

export function getTurboMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function setTurboMode(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(KEY, "1");
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useTurboMode(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => getTurboMode());
  useEffect(() => {
    const h = () => setOn(getTurboMode());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return [on, (v: boolean) => setTurboMode(v)];
}

/**
 * Retorna true se o alvo do evento é um input/textarea/contenteditable/select.
 * Usado para decidir se um atalho global deve ou não sobrescrever comportamento nativo.
 */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}
