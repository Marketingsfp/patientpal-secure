import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Mapa: rótulo do grupo do menu → chaves dos itens na ordem escolhida. */
export type MenuOrdem = Record<string, string[]>;

/**
 * Ordem personalizada dos itens do menu lateral, POR USUÁRIO
 * (profiles.preferencias_ui.menu_ordem). Piloto de UX da São Francisco de
 * Paula (flag ux_melhorias): o usuário arrasta itens do menu para reordenar;
 * cada grupo guarda a lista de chaves na ordem escolhida. Com `enabled`
 * false o hook não lê nem grava nada.
 */
export function useMenuOrdem(enabled: boolean) {
  const [ordem, setOrdem] = useState<MenuOrdem>({});
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !alive) return;
      uidRef.current = u.user.id;
      const { data } = await supabase
        .from("profiles")
        .select("preferencias_ui")
        .eq("id", u.user.id)
        .maybeSingle();
      const prefs = (data?.preferencias_ui ?? {}) as { menu_ordem?: MenuOrdem };
      if (alive && prefs.menu_ordem) setOrdem(prefs.menu_ordem);
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  const salvar = useCallback(async (nova: MenuOrdem) => {
    setOrdem(nova);
    if (!uidRef.current) return;
    // Merge com o preferencias_ui existente para não apagar outras chaves
    // (flags, clientes.compact, etc.).
    const { data } = await supabase
      .from("profiles")
      .select("preferencias_ui")
      .eq("id", uidRef.current)
      .maybeSingle();
    const prev = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    await supabase
      .from("profiles")
      .update({ preferencias_ui: { ...prev, menu_ordem: nova } })
      .eq("id", uidRef.current);
  }, []);

  return { ordem, salvar };
}
