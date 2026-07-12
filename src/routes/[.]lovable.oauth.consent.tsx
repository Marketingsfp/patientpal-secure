import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Tipagem local para a API beta supabase.auth.oauth.
type AuthorizationDetails = {
  client?: { name?: string; redirect_uris?: string[] } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
function oauthClient(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

function isSafeRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Parâmetro authorization_id ausente");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + (location.searchStr ?? "");
    if (!data.session) {
      throw redirect({ href: `/login?next=${encodeURIComponent(next)}` });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthClient().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      return data;
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-lg font-semibold">Não foi possível carregar esta autorização</h1>
        <p className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthClient();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "este aplicativo";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Conectar {clientName} ao ClinicaOS
          </h1>
          <p className="text-sm text-muted-foreground">
            Isso permite que {clientName} use o ClinicaOS como você.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
          <p className="font-medium">O que será concedido</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>Chamar as ferramentas MCP habilitadas neste sistema em seu nome</li>
            <li>Ler dados apenas onde suas permissões e RLS por clínica permitirem</li>
          </ul>
          <p className="text-xs text-muted-foreground pt-2">
            Isto não amplia suas permissões nem contorna as políticas de segurança do sistema.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Cancelar conexão
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            {busy ? "Processando..." : "Aprovar"}
          </Button>
        </div>
      </div>
    </main>
  );
}

export { isSafeRelativePath };