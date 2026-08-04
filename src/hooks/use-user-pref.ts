import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

/**
 * Estado persistido por usuário (filtros, ordenação, abas de relatórios).
 * Guarda em localStorage com chave escopada no id do usuário logado,
 * então cada pessoa que usa a mesma máquina mantém as próprias preferências.
 */
export function useUserPref<T>(key: string, initial: T) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const storageKey = uid ? `pref:${uid}:${key}` : null;
  const [value, setValue] = useState<T>(initial);
  const hydratedFor = useRef<string | null>(null);

  // Restaura assim que o usuário estiver disponível
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    if (hydratedFor.current === storageKey) return;
    hydratedFor.current = storageKey;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignora preferência corrompida */
    }
  }, [storageKey]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (storageKey && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(resolved));
          } catch {
            /* quota cheia: segue sem persistir */
          }
        }
        return resolved;
      });
    },
    [storageKey]
  );

  const reset = useCallback(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch { /* noop */ }
    }
    setValue(initial);
    // initial é estável nos usos deste projeto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return [value, update, reset] as const;
}
