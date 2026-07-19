import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "clinicaos:theme";

function readPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function resolveDark(pref: ThemePref): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Tema claro/escuro do app (classe `dark` no <html>, tokens já definidos em
 * styles.css). Preferência por navegador em localStorage.
 *
 * `enabled` (flag de clínica `ux_melhorias`): quando false, a classe `dark`
 * é removida e a preferência é ignorada — clínicas fora do piloto continuam
 * sempre no tema claro.
 */
export function useTheme(enabled: boolean) {
  const [pref, setPref] = useState<ThemePref>(readPref);

  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.classList.remove("dark");
      return;
    }
    const apply = () => root.classList.toggle("dark", resolveDark(pref));
    apply();
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [enabled, pref]);

  const set = useCallback((v: ThemePref) => {
    window.localStorage.setItem(STORAGE_KEY, v);
    setPref(v);
  }, []);

  return { pref, set, isDark: enabled && resolveDark(pref) };
}
