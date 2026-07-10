import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RecentEntry = { path: string; label: string; ts: number };

export interface MenuPrefs {
  pinned: string[];
  favorites: string[];
  recent: RecentEntry[];
  groups: Record<string, boolean>;
  collapsed: boolean;
}

const DEFAULT_PREFS: MenuPrefs = {
  pinned: [],
  favorites: [],
  recent: [],
  groups: {},
  collapsed: false,
};

const EVT_FLAG = "menu:flag-changed";
const EVT_PREFS = "menu:prefs-changed";

/** Feature flag menu_v2 em profiles.preferencias_ui.flags.menu_v2 (default false). */
export function useMenuV2Flag() {
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
      const prefs = (data?.preferencias_ui ?? {}) as { flags?: { menu_v2?: boolean } };
      if (alive) {
        setEnabled(Boolean(prefs.flags?.menu_v2));
        setLoading(false);
      }
    })();
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ menu_v2: boolean }>;
      if (alive && ce.detail) setEnabled(Boolean(ce.detail.menu_v2));
    };
    window.addEventListener(EVT_FLAG, onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(EVT_FLAG, onChange as EventListener);
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
    const flags = { ...((prev.flags as object) ?? {}), menu_v2: v };
    const next = { ...prev, flags };
    await supabase.from("profiles").update({ preferencias_ui: next }).eq("id", uidRef.current);
    setEnabled(v);
    window.dispatchEvent(new CustomEvent(EVT_FLAG, { detail: { menu_v2: v } }));
  }, []);

  return { enabled, loading, setEnabled: set };
}

/** Lê/escreve profiles.preferencias_ui.menu com debounce de 2s. */
export function useMenuPrefs() {
  const [prefs, setPrefs] = useState<MenuPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const uidRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef<MenuPrefs | null>(null);

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
      const raw = (data?.preferencias_ui ?? {}) as { menu?: Partial<MenuPrefs> };
      if (alive) {
        setPrefs({ ...DEFAULT_PREFS, ...(raw.menu ?? {}) });
        setLoading(false);
      }
    })();
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<MenuPrefs>;
      if (alive && ce.detail) setPrefs(ce.detail);
    };
    window.addEventListener(EVT_PREFS, onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(EVT_PREFS, onChange as EventListener);
    };
  }, []);

  const flush = useCallback(async () => {
    if (!uidRef.current || !dirtyRef.current) return;
    const payload = dirtyRef.current;
    dirtyRef.current = null;
    const { data } = await supabase
      .from("profiles")
      .select("preferencias_ui")
      .eq("id", uidRef.current)
      .maybeSingle();
    const prev = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    const next = { ...prev, menu: payload as unknown as Record<string, unknown> };
    await supabase
      .from("profiles")
      .update({ preferencias_ui: next as never })
      .eq("id", uidRef.current);
  }, []);

  const update = useCallback(
    (mut: (p: MenuPrefs) => MenuPrefs) => {
      setPrefs((cur) => {
        const nx = mut(cur);
        dirtyRef.current = nx;
        // dispatch fora do updater para evitar setState durante render em outros listeners
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent(EVT_PREFS, { detail: nx }));
        });
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          void flush();
        }, 2000);
        return nx;
      });
    },
    [flush],
  );

  const togglePin = useCallback(
    (path: string) => {
      update((p) => ({
        ...p,
        pinned: p.pinned.includes(path) ? p.pinned.filter((x) => x !== path) : [...p.pinned, path],
      }));
    },
    [update],
  );

  const toggleFavorite = useCallback(
    (path: string) => {
      update((p) => ({
        ...p,
        favorites: p.favorites.includes(path)
          ? p.favorites.filter((x) => x !== path)
          : [...p.favorites, path],
      }));
    },
    [update],
  );

  const toggleGroup = useCallback(
    (key: string) => {
      update((p) => ({ ...p, groups: { ...p.groups, [key]: !(p.groups[key] ?? true) } }));
    },
    [update],
  );

  const pushRecent = useCallback(
    (entry: { path: string; label: string }) => {
      if (entry.path.startsWith("/auth") || entry.path.includes("/dev-")) return;
      update((p) => {
        const filtered = p.recent.filter((r) => r.path !== entry.path);
        const nx = [{ ...entry, ts: Date.now() }, ...filtered].slice(0, 20);
        return { ...p, recent: nx };
      });
    },
    [update],
  );

  return { prefs, loading, togglePin, toggleFavorite, toggleGroup, pushRecent, update };
}
