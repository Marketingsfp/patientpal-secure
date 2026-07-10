import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { presetAllowedSet } from "@/lib/permissoes-presets";

/**
 * Retorna o conjunto de módulos visíveis para o usuário atual na clínica atual.
 *
 * - `null` significa "sem filtro" (admin ou ainda carregando) — mostre tudo.
 * - `Set<string>` lista as chaves de módulo permitidas (acesso != "none").
 *
 * A fonte de verdade é a tabela `perfil_permissoes`. Quando nenhum registro
 * existe ainda para o perfil, caímos no preset definido em
 * `src/lib/permissoes-presets.ts` para que o sistema não fique vazio antes
 * do gestor salvar a primeira configuração.
 */
export function usePermissoes(): { allowed: Set<string> | null; loading: boolean } {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const role = clinicaAtual?.role ?? null;
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicaId || !role) {
      setAllowed(null);
      return;
    }
    // Admin: sem filtro.
    if (role === "admin") {
      setAllowed(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data: perfil } = await supabase
          .from("perfis_acesso")
          .select("id")
          .eq("clinica_id", clinicaId)
          .eq("chave", role)
          .maybeSingle();

        if (cancelled) return;

        if (!perfil) {
          setAllowed(presetAllowedSet(role));
          return;
        }

        const { data: perms } = await supabase
          .from("perfil_permissoes")
          .select("modulo, acesso")
          .eq("perfil_id", perfil.id);

        if (cancelled) return;

        if (!perms || perms.length === 0) {
          setAllowed(presetAllowedSet(role));
          return;
        }

        const set = new Set<string>();
        for (const p of perms) if (p.acesso && p.acesso !== "none") set.add(p.modulo);
        setAllowed(set);
      } catch (e) {
        console.error("[usePermissoes] erro carregando permissões", e);
        // Em caso de erro, cai no preset para não travar o usuário.
        if (!cancelled) setAllowed(presetAllowedSet(role));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicaId, role]);

  return { allowed, loading };
}
