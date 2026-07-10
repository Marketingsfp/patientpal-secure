import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const EVT = "caixa:flag-changed";

/** Feature flag caixa_v2 em profiles.preferencias_ui.flags.caixa_v2 (default false). */
export function useCaixaV2Flag() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (alive) setLoading(false);
        return;
      }
      uidRef.current = u.user.id;
      const { data } = await supabase
        .from("profiles")
        .select("preferencias_ui")
        .eq("id", u.user.id)
        .maybeSingle();
      const prefs = (data?.preferencias_ui ?? {}) as { flags?: { caixa_v2?: boolean } };
      if (alive) {
        setEnabled(Boolean(prefs.flags?.caixa_v2));
        setLoading(false);
      }
    })();
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ caixa_v2: boolean }>;
      if (alive && ce.detail) setEnabled(Boolean(ce.detail.caixa_v2));
    };
    window.addEventListener(EVT, onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(EVT, onChange as EventListener);
    };
  }, []);

  const set = useCallback(async (v: boolean) => {
    if (!uidRef.current) return;
    const { data } = await supabase
      .from("profiles")
      .select("preferencias_ui")
      .eq("id", uidRef.current)
      .maybeSingle();
    const prev = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    const flags = { ...((prev.flags as object) ?? {}), caixa_v2: v };
    const next = { ...prev, flags };
    await supabase.from("profiles").update({ preferencias_ui: next }).eq("id", uidRef.current);
    setEnabled(v);
    window.dispatchEvent(new CustomEvent(EVT, { detail: { caixa_v2: v } }));
  }, []);

  return { enabled, loading, setEnabled: set };
}
