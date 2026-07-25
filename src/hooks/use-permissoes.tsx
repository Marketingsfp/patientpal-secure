import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { presetAllowedSet, PRESETS } from "@/lib/permissoes-presets";

export type Acesso = "none" | "read" | "write";

export interface PermissoesValue {
  allowed: Set<string> | null;
  nivel: Map<string, "read" | "write"> | null;
  configured: Set<string> | null;
  loading: boolean;
}

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
function usePermissoesQuery(): PermissoesValue {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const role = clinicaAtual?.role ?? null;
  // Começa fechado. `null` é reservado exclusivamente ao admin já identificado.
  const [allowed, setAllowed] = useState<Set<string> | null>(() => new Set());
  const [nivel, setNivel] = useState<Map<string, "read" | "write"> | null>(() => new Map());
  const [configured, setConfigured] = useState<Set<string> | null>(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicaId || !role) {
      setAllowed(new Set());
      setNivel(new Map());
      setConfigured(new Set());
      setLoading(false);
      return;
    }
    // Admin: sem filtro.
    if (role === "admin") {
      setAllowed(null);
      setNivel(null);
      setConfigured(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Troca de clínica/perfil: não preserve permissões da sessão anterior.
    setAllowed(new Set());
    setNivel(new Map());
    setConfigured(new Set());
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
          setConfigured(new Set());
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
          setConfigured(new Set());
          return;
        }

        const set = new Set<string>();
        const nvl = new Map<string, "read" | "write">();
        const cfg = new Set<string>();
        for (const p of perms) {
          if (p.modulo) cfg.add(p.modulo);
          if (p.acesso && p.acesso !== "none") {
            set.add(p.modulo);
            if (p.acesso === "read" || p.acesso === "write") nvl.set(p.modulo, p.acesso);
          }
        }
        setAllowed(set);
        setNivel(nvl);
        setConfigured(cfg);
      } catch (e) {
        console.error("[usePermissoes] erro carregando permissões", e);
        // Autorização deve falhar fechada: erro de rede/RLS nunca amplia acesso.
        if (!cancelled) { setAllowed(new Set()); setNivel(new Map()); setConfigured(new Set()); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [clinicaId, role]);

  return useMemo(() => ({ allowed, nivel, configured, loading }), [allowed, nivel, configured, loading]);
}

const PermissoesContext = createContext<PermissoesValue | null>(null);

// Fallback fechado para quando o provider não está acima na árvore (ex.: rotas
// isoladas como /medico ou /totem). Autorização falha fechada por princípio.
const PERMISSOES_FECHADO: PermissoesValue = {
  allowed: new Set(),
  nivel: new Map(),
  configured: new Set(),
  loading: false,
};

/**
 * Busca as permissões UMA vez por (clínica, papel) e compartilha com toda a
 * árvore. Antes cada `usePodeEscrever()` era um hook independente, com estado e
 * efeito próprios, refazendo as duas queries sequenciais (`perfis_acesso` →
 * `perfil_permissoes`). Como há ~80 pontos de uso e o componente da rota
 * remonta a cada troca de aba, isso custava vários round trips redundantes por
 * navegação.
 */
export function PermissoesProvider({ children }: { children: ReactNode }) {
  const value = usePermissoesQuery();
  return <PermissoesContext.Provider value={value}>{children}</PermissoesContext.Provider>;
}

export function usePermissoes(): PermissoesValue {
  return useContext(PermissoesContext) ?? PERMISSOES_FECHADO;
}

/**
 * Nível de acesso do usuário atual num módulo específico.
 * - admin identificado (allowed=null) → "write" (sem restrição).
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
