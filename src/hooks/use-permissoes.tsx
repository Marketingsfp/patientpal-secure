import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { presetAllowedSet, PRESETS, type PerfilKey } from "@/lib/permissoes-presets";

export type Acesso = "none" | "read" | "write";

function nivelDoPreset(role: string): Map<string, "read" | "write"> {
  const preset = (PRESETS as Record<string, Partial<Record<string, Acesso>>>)[role] ?? {};
  const map = new Map<string, "read" | "write">();
  for (const [k, v] of Object.entries(preset)) {
    if (v === "read" || v === "write") map.set(k, v);
  }
  return map;
}

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
export function usePermissoes(): {
  allowed: Set<string> | null;
  nivel: Map<string, "read" | "write"> | null;
  loading: boolean;
} {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const role = clinicaAtual?.role ?? null;
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  const [nivel, setNivel] = useState<Map<string, "read" | "write"> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clinicaId || !role) {
      setAllowed(null);
      setNivel(null);
      return;
    }
    // Admin: sem filtro.
    if (role === "admin") {
      setAllowed(null);
      setNivel(null);
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
          setNivel(nivelDoPreset(role));
          return;
        }

        const { data: perms } = await supabase
          .from("perfil_permissoes")
          .select("modulo, acesso")
          .eq("perfil_id", perfil.id);

        if (cancelled) return;

        if (!perms || perms.length === 0) {
          setAllowed(presetAllowedSet(role));
          setNivel(nivelDoPreset(role));
          return;
        }

        const set = new Set<string>();
        const nvl = new Map<string, "read" | "write">();
        for (const p of perms) {
          if (p.acesso && p.acesso !== "none") {
            set.add(p.modulo);
            if (p.acesso === "read" || p.acesso === "write") nvl.set(p.modulo, p.acesso);
          }
        }
        setAllowed(set);
        setNivel(nvl);
      } catch (e) {
        console.error("[usePermissoes] erro carregando permissões", e);
        // Em caso de erro, cai no preset para não travar o usuário.
        if (!cancelled) { setAllowed(presetAllowedSet(role)); setNivel(nivelDoPreset(role)); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [clinicaId, role]);

  return { allowed, nivel, loading };
}

/**
 * Nível de acesso do usuário atual num módulo específico.
 * - admin (ou ainda carregando com nivel=null) → "write" (sem restrição).
 * - Sem entrada no mapa → "none".
 */
export function useAcessoModulo(modulo: string): Acesso {
  const { nivel, allowed } = usePermissoes();
  if (allowed === null) return "write"; // admin
  const n = nivel?.get(modulo);
  if (n) return n;
  return "none";
}

/** Atalho: usuário pode gravar/editar/excluir neste módulo? */
export function usePodeEscrever(modulo: string): boolean {
  return useAcessoModulo(modulo) === "write";
}