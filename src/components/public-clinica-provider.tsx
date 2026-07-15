import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ClinicaContext,
  type ClinicaBranding,
  type ClinicaMembership,
} from "@/hooks/use-clinica";
import { Loader2 } from "lucide-react";

/**
 * Provider "público" que injeta a clínica no mesmo ClinicaContext usado pelo
 * ClinicaProvider autenticado. Consumido por /painel/$clinicaId e
 * /totem/$clinicaId — rotas abertas sem login, identificadas pelo UUID da
 * clínica na URL.
 *
 * Não tem memberships nem modo "todas". O consumidor (painel/totem) só usa
 * `clinicaAtual`, `loading` e `branding`.
 */
export function PublicClinicaProvider({
  clinicaId,
  token,
  children,
}: {
  clinicaId?: string;
  token?: string;
  children: ReactNode;
}) {
  const [membership, setMembership] = useState<ClinicaMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setErro(null);
    (async () => {
      let data: {
        id: string;
        nome: string;
        cidade: string | null;
        estado: string | null;
        branding: unknown;
        base_importada: boolean | null;
      } | null = null;
      let error: unknown = null;
      if (token) {
        const res = await supabase.rpc("resolver_clinica_por_token", { _token: token });
        data = (res.data?.[0] ?? null) as typeof data;
        error = res.error;
      } else if (clinicaId) {
        const res = await supabase
          .from("clinicas")
          .select("id, nome, cidade, estado, branding, base_importada")
          .eq("id", clinicaId)
          .maybeSingle();
        data = res.data as typeof data;
        error = res.error;
      }
      if (cancelado) return;
      if (error || !data) {
        setErro("Clínica não encontrada ou sem acesso público.");
        setMembership(null);
      } else {
        setMembership({
          id: `public-${data.id}`,
          clinica_id: data.id,
          role: "public",
          clinica: {
            id: data.id,
            nome: data.nome,
            cidade: data.cidade,
            estado: data.estado,
            branding: (data.branding ?? null) as ClinicaBranding | null,
            base_importada: data.base_importada,
          },
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId, token]);

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-2 max-w-md">
          <h1 className="text-2xl font-semibold">Clínica não encontrada</h1>
          <p className="text-muted-foreground">{erro}</p>
          <p className="text-xs text-muted-foreground">Referência: {token ?? clinicaId}</p>
        </div>
      </div>
    );
  }

  return (
    <ClinicaContext.Provider
      value={{
        memberships: membership ? [membership] : [],
        clinicaAtual: membership,
        setClinicaAtual: () => {},
        modoTodas: false,
        setModoTodas: () => {},
        clinicaIds: membership ? [membership.clinica_id] : [],
        branding: membership?.clinica.branding ?? null,
        loading,
        refresh: async () => {},
      }}
    >
      {loading && !membership ? (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        children
      )}
    </ClinicaContext.Provider>
  );
}