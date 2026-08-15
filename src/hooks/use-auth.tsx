import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readCachedSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const cached = parsed?.currentSession ?? parsed;
      if (cached?.access_token && cached?.user) return cached as Session;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Apaga o estado local que sobrevive ao signOut do Supabase: cache de
 * memberships/clínica atual (de onde sai o `role` usado pela UI) e rascunhos
 * de prontuário do atendimento com IA.
 *
 * Sem isto, em terminal compartilhado (recepção, consultório) o próximo
 * usuário herda o contexto do anterior.
 */
function limparEstadoLocal() {
  if (typeof window === "undefined") return;
  try {
    const remover: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("clinica_") || key.startsWith("pep:")) remover.push(key);
    }
    for (const key of remover) window.localStorage.removeItem(key);
  } catch {
    /* localStorage indisponível — nada a limpar */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(typeof window !== "undefined");

  useEffect(() => {
    let cancelled = false;
    const cachedSession = readCachedSession();
    if (cachedSession) {
      setSession(cachedSession);
      setLoading(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);
    });

    const fallbackTimer = window.setTimeout(() => {
      if (cancelled) return;
      setSession((current) => current ?? readCachedSession());
      setLoading(false);
    }, 2500);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        window.clearTimeout(fallbackTimer);
        setSession(data.session ?? readCachedSession());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        window.clearTimeout(fallbackTimer);
        setSession((current) => current ?? readCachedSession());
        setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          try {
            await supabase.auth.signOut();
          } finally {
            limparEstadoLocal();
            // Recarga completa em vez de navegação SPA: descarta o cache do
            // React Query (staleTime de 5 min, gcTime de 30 min, sem
            // refetchOnMount), que de outro modo serviria os dados do usuário
            // anterior — lista de pacientes, financeiro, prontuário aberto —
            // para quem logar em seguida na mesma máquina.
            if (typeof window !== "undefined") {
              window.location.replace("/login");
            }
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
