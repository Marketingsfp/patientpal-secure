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

  const load = async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("clinica_memberships")
      .select("id, clinica_id, role, clinica:clinicas(id, nome, cidade, estado, branding)")
      .eq("user_id", user.id)
      .eq("ativo", true);
    if (!error && data) setMemberships(data as unknown as ClinicaMembership[]);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

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