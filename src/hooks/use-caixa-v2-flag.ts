import { useCallback, useEffect, useState } from "react";
import { getFlagUsuario, setFlagUsuario } from "@/lib/cache/prefs-cache";

const EVT = "caixa:flag-changed";

/**
 * Feature flag `caixa_v2` em `profiles.preferencias_ui.flags.caixa_v2` (default false).
 * A leitura do perfil é compartilhada entre todos os hooks de flag
 * (ver `src/lib/cache/prefs-cache.ts`) para evitar SELECTs repetidos.
 */
export function useCaixaV2Flag() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const v = await getFlagUsuario("caixa_v2");
      if (alive) { setEnabled(Boolean(v)); setLoading(false); }
    })();
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ caixa_v2: boolean }>;
      if (alive && ce.detail) setEnabled(Boolean(ce.detail.caixa_v2));
    };
    window.addEventListener(EVT, onChange as EventListener);
    return () => { alive = false; window.removeEventListener(EVT, onChange as EventListener); };
  }, []);

  const set = useCallback(async (v: boolean) => {
    await setFlagUsuario("caixa_v2", v);
    setEnabled(v);
    window.dispatchEvent(new CustomEvent(EVT, { detail: { caixa_v2: v } }));
  }, []);

  return { enabled, loading, setEnabled: set };
}
