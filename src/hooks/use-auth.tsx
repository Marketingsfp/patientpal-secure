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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);
    });

    const fallbackTimer = window.setTimeout(() => {
      if (cancelled) return;
      setSession((current) => current ?? readCachedSession());
      setLoading(false);
    }, 2500);

    supabase.auth.getSession()
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
        signOut: async () => { await supabase.auth.signOut(); },
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