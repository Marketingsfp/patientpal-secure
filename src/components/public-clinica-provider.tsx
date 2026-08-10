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
      type ClinicaRow = {
        id: string;
        nome: string;
        cidade: string | null;
        estado: string | null;
        branding: unknown;
        base_importada: boolean | null;
      };
      let data: ClinicaRow | null = null;
      let error: unknown = null;
      if (token) {
        const res = await supabase.rpc("resolver_clinica_por_token", { _token: token });
        const arr = (res.data ?? []) as ClinicaRow[];
        data = arr[0] ?? null;
        error = res.error;
      } else if (clinicaId) {
        const res = await supabase.rpc("resolver_clinica_publica", { _clinica_id: clinicaId });
        const arr = (res.data ?? []) as ClinicaRow[];
        data = arr[0] ?? null;
        error = res.error;
      }
      if (cancelado) return;
      const row = data;
      if (error || !row) {
        setErro("Clínica não encontrada ou sem acesso público.");
        setMembership(null);
      } else {
        setMembership({
          id: `public-${row.id}`,
          clinica_id: row.id,
          role: "public",
          clinica: {
            id: row.id,
            nome: row.nome,
            cidade: row.cidade,
            estado: row.estado,
            branding: (row.branding ?? null) as ClinicaBranding | null,
            base_importada: row.base_importada,
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