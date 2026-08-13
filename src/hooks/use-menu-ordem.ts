import { useCallback, useEffect, useState } from "react";
import { getPreferenciasUi, updatePreferenciasUi } from "@/lib/cache/prefs-cache";

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

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      const { prefs } = await getPreferenciasUi();
      const menuOrdem = (prefs as { menu_ordem?: MenuOrdem }).menu_ordem;
      if (alive && menuOrdem) setOrdem(menuOrdem);
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  const salvar = useCallback(async (nova: MenuOrdem) => {
    setOrdem(nova);
    // Merge com o preferencias_ui existente para não apagar outras chaves
    // (flags, clientes.compact, etc.).
    await updatePreferenciasUi((prev) => ({ ...prev, menu_ordem: nova }));
  }, []);

  return { ordem, salvar };
}
