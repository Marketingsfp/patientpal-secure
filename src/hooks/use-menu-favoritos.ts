import { useCallback, useEffect, useRef, useState } from "react";
import { getPreferenciasUi, updatePreferenciasUi } from "@/lib/cache/prefs-cache";

/**
 * Telas fixadas pelo usuário na seção "Meus Favoritos" do menu lateral, POR
 * USUÁRIO (profiles.preferencias_ui.menu_favoritos), na ordem em que foram
 * marcadas. Guarda só a chave do item (rota + hash); quem decide se o item
 * aparece continua sendo o filtro de permissões do menu — favoritar uma tela
 * não libera acesso a ela, e uma tela que deixou de ser liberada some da seção
 * sozinha.
 *
 * Vale para todas as clínicas, sem flag: a estrela fica ao lado de cada item.
 */
export function useMenuFavoritos() {
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const atualRef = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { prefs } = await getPreferenciasUi();
      const salvos = (prefs as { menu_favoritos?: unknown }).menu_favoritos;
      if (!alive || !Array.isArray(salvos)) return;
      const lista = salvos.filter((k): k is string => typeof k === "string");
      atualRef.current = lista;
      setFavoritos(lista);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const alternar = useCallback(async (key: string) => {
    const atual = atualRef.current;
    const nova = atual.includes(key) ? atual.filter((k) => k !== key) : [...atual, key];
    atualRef.current = nova;
    setFavoritos(nova);
    // Merge com o preferencias_ui existente para não apagar outras chaves
    // (flags, menu_ordem, clientes.compact, etc.).
    await updatePreferenciasUi((prev) => ({ ...prev, menu_favoritos: nova }));
  }, []);

  return { favoritos, alternar };
}
