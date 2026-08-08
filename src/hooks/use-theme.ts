import { useCallback, useEffect } from "react";

export type ThemePref = "light" | "dark" | "system";

/**
 * Modo escuro desativado globalmente: o app sempre renderiza no tema claro.
 * O hook é mantido apenas para compatibilidade das chamadas existentes e
 * garante a remoção da classe `dark` do <html>.
 */
export function useTheme(_enabled?: boolean) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const set = useCallback((_v: ThemePref) => {}, []);

  return { pref: "light" as ThemePref, set, isDark: false };
}
