import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export interface ClinicaMembership {
  id: string;
  clinica_id: string;
  role: string;
  clinica: {
    id: string;
    nome: string;
    cidade: string | null;
    estado: string | null;
    branding?: ClinicaBranding | null;
    base_importada?: boolean | null;
  };
}

export interface ClinicaBranding {
  logo_url?: string | null;
  primary?: string | null;
  accent?: string | null;
}

interface ClinicaContextValue {
  memberships: ClinicaMembership[];
  clinicaAtual: ClinicaMembership | null;
  setClinicaAtual: (id: string) => void;
  /** "todas" representa modo agregado (todas as clínicas do usuário). */
  modoTodas: boolean;
  setModoTodas: (v: boolean) => void;
  /** IDs efetivos para queries: [clinicaAtual.id] ou todas as memberships. */
  clinicaIds: string[];
  branding: ClinicaBranding | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ClinicaContext = createContext<ClinicaContextValue | undefined>(undefined);
const STORAGE_KEY = "clinica_atual_id";
const TODAS_KEY = "clinica_modo_todas";
const MEMBERSHIPS_CACHE_KEY = "clinica_memberships_cache_v1";

function isClinicaMembership(value: unknown): value is ClinicaMembership {
  const membership = value as Partial<ClinicaMembership> | null;
  return Boolean(
    membership?.id &&
    membership.clinica_id &&
    membership.role &&
    membership.clinica &&
    typeof membership.clinica.nome === "string",
  );
}

function readCachedMemberships(userId?: string): ClinicaMembership[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MEMBERSHIPS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!userId || parsed?.userId !== userId || !Array.isArray(parsed?.memberships)) return [];
    return parsed.memberships.filter(isClinicaMembership);
  } catch {
    return [];
  }
}

export function ClinicaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<ClinicaMembership[]>([]);
  const [clinicaAtualId, setClinicaAtualId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
  const [modoTodas, setModoTodasState] = useState<boolean>(
    typeof window !== "undefined" ? localStorage.getItem(TODAS_KEY) === "1" : false,
  );
  const [loading, setLoading] = useState(true);

  const load = async (showLoading = memberships.length === 0) => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    const { data, error } = await supabase
      .from("clinica_memberships")
      .select("id, clinica_id, role, clinica:clinicas(id, nome, cidade, estado, branding, base_importada)")
      .eq("user_id", user.id)
      .eq("ativo", true);
    if (!error && data) {
      const raw = (data as unknown[]).filter(isClinicaMembership);
      // A6 — Oculta unidades ainda não operacionais (base não importada
      // E sem médicos ativos), exceto para admin, que precisa enxergá-las
      // para configurar. Ex.: "CLINICA CONSULTA HOJE".
      const naoOperacionais = raw.filter(
        (m) => m.role !== "admin" && m.clinica.base_importada === false,
      );
      let next = raw;
      if (naoOperacionais.length > 0) {
        const ids = naoOperacionais.map((m) => m.clinica_id);
        const { data: medicos } = await supabase
          .from("medicos")
          .select("clinica_id")
          .in("clinica_id", ids)
          .eq("ativo", true)
          .limit(1000);
        const comMedico = new Set((medicos ?? []).map((r: { clinica_id: string }) => r.clinica_id));
        next = raw.filter((m) => {
          if (m.role === "admin") return true;
          if (m.clinica.base_importada !== false) return true;
          return comMedico.has(m.clinica_id);
        });
      }
      setMemberships(next);
      try {
        window.localStorage.setItem(MEMBERSHIPS_CACHE_KEY, JSON.stringify({ userId: user.id, memberships: next }));
      } catch { /* ignore quota */ }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user?.id) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    const cached = readCachedMemberships(user.id);
    setMemberships(cached);
    setLoading(cached.length === 0);
    void load(cached.length === 0);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id]);

  const setClinicaAtual = (id: string) => {
    setClinicaAtualId(id);
    setModoTodasState(false);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    if (typeof window !== "undefined") localStorage.setItem(TODAS_KEY, "0");
  };

  const setModoTodas = (v: boolean) => {
    setModoTodasState(v);
    if (typeof window !== "undefined") localStorage.setItem(TODAS_KEY, v ? "1" : "0");
  };

  const clinicaAtual =
    memberships.find((m) => m.clinica_id === clinicaAtualId) ?? memberships[0] ?? null;

  const clinicaIds = modoTodas
    ? memberships.map((m) => m.clinica_id)
    : clinicaAtual
      ? [clinicaAtual.clinica_id]
      : [];

  const branding = (clinicaAtual?.clinica.branding ?? null) as ClinicaBranding | null;

  return (
    <ClinicaContext.Provider
      value={{
        memberships,
        clinicaAtual,
        setClinicaAtual,
        modoTodas,
        setModoTodas,
        clinicaIds,
        branding,
        loading,
        refresh: load,
      }}
    >
      {children}
    </ClinicaContext.Provider>
  );
}

export function useClinica() {
  const ctx = useContext(ClinicaContext);
  if (!ctx) throw new Error("useClinica must be used within ClinicaProvider");
  return ctx;
}