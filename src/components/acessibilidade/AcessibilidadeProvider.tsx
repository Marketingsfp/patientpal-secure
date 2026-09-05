import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  A11Y_DEFAULTS,
  aplicarPrefs,
  lerLocal,
  normalizarPrefs,
  salvarLocal,
  type A11yPrefs,
} from "@/lib/acessibilidade/prefs";

type Ctx = {
  prefs: A11yPrefs;
  set: <K extends keyof A11yPrefs>(chave: K, valor: A11yPrefs[K]) => void;
  restaurarPadrao: () => void;
  /** Anuncia um texto para leitores de tela (região aria-live educada). */
  anunciar: (texto: string, assertivo?: boolean) => void;
};

const AcessibilidadeCtx = createContext<Ctx | null>(null);

export function useAcessibilidade(): Ctx {
  const ctx = useContext(AcessibilidadeCtx);
  if (!ctx) {
    // Fora do provider (telas públicas): devolve um objeto inerte para não
    // quebrar componentes reutilizados no totem/portal.
    return {
      prefs: A11Y_DEFAULTS,
      set: () => {},
      restaurarPadrao: () => {},
      anunciar: () => {},
    };
  }
  return ctx;
}

/**
 * Camada de acessibilidade: guarda as preferências DO USUÁRIO autenticado
 * (perfil no banco + cache local para aplicar sem piscar) e as reflete no
 * <html> como classes/variáveis CSS.
 */
export function AcessibilidadeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<A11yPrefs>(() => lerLocal() ?? A11Y_DEFAULTS);
  const [educado, setEducado] = useState("");
  const [assertivo, setAssertivo] = useState("");
  const carregadoDoBanco = useRef(false);
  const userIdRef = useRef<string | null>(null);

  // Aplica imediatamente (inclusive antes do banco responder) para evitar o
  // "flash" da configuração padrão.
  useEffect(() => {
    aplicarPrefs(prefs);
  }, [prefs]);

  // Carrega do perfil do usuário — a fonte de verdade entre máquinas.
  useEffect(() => {
    const uid = user?.id ?? null;
    if (!uid) {
      userIdRef.current = null;
      carregadoDoBanco.current = false;
      return;
    }
    if (userIdRef.current === uid) return;
    userIdRef.current = uid;
    let cancelado = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("preferencias_ui")
        .eq("id", uid)
        .maybeSingle();
      if (cancelado) return;
      const bruto = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
      if (bruto && typeof bruto === "object" && bruto["acessibilidade"]) {
        const p = normalizarPrefs(bruto["acessibilidade"]);
        setPrefs(p);
        salvarLocal(p);
      }
      carregadoDoBanco.current = true;
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.id]);

  const persistir = useCallback(async (p: A11yPrefs) => {
    salvarLocal(p);
    const uid = userIdRef.current;
    if (!uid) return;
    const { data } = await supabase
      .from("profiles")
      .select("preferencias_ui")
      .eq("id", uid)
      .maybeSingle();
    const atual = (data?.preferencias_ui ?? {}) as Record<string, unknown>;
    await supabase
      .from("profiles")
      .update({ preferencias_ui: { ...atual, acessibilidade: p } })
      .eq("id", uid);
  }, []);

  const set = useCallback(
    <K extends keyof A11yPrefs>(chave: K, valor: A11yPrefs[K]) => {
      setPrefs((antes) => {
        const novo = { ...antes, [chave]: valor } as A11yPrefs;
        void persistir(novo).catch(() => {});
        return novo;
      });
    },
    [persistir],
  );

  const restaurarPadrao = useCallback(() => {
    setPrefs(A11Y_DEFAULTS);
    void persistir(A11Y_DEFAULTS).catch(() => {});
  }, [persistir]);

  const anunciar = useCallback((texto: string, urgente = false) => {
    if (!texto) return;
    if (urgente) {
      setAssertivo("");
      setTimeout(() => setAssertivo(texto), 30);
    } else {
      setEducado("");
      setTimeout(() => setEducado(texto), 30);
    }
  }, []);

  const value = useMemo(
    () => ({ prefs, set, restaurarPadrao, anunciar }),
    [prefs, set, restaurarPadrao, anunciar],
  );

  return (
    <AcessibilidadeCtx.Provider value={value}>
      {children}
      <FiltrosDaltonismo />
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {educado}
      </span>
      <span aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertivo}
      </span>
    </AcessibilidadeCtx.Provider>
  );
}

/** Matrizes de correção de cor usadas pelos modos de daltonismo. */
function FiltrosDaltonismo() {
  return (
    <svg aria-hidden="true" focusable="false" className="absolute h-0 w-0 overflow-hidden">
      <defs>
        <filter id="a11y-protanopia">
          <feColorMatrix
            type="matrix"
            values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id="a11y-deuteranopia">
          <feColorMatrix
            type="matrix"
            values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id="a11y-tritanopia">
          <feColorMatrix
            type="matrix"
            values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"
          />
        </filter>
      </defs>
    </svg>
  );
}
