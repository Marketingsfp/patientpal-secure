// Tela de consentimento OAuth: onde o usuário aprova (ou recusa) que um
// assistente externo — ChatGPT, Claude, Lovable — use o Health Hub Pro em nome
// dele. É chamada pelo servidor de autorização com um `authorization_id`.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthClienteInfo = {
  client?: { name?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: OAuthClienteInfo | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthClienteInfo | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: OAuthClienteInfo | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Só no navegador: o cliente Supabase lê a sessão do localStorage, que não
  // existe durante a renderização no servidor.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Parâmetro authorization_id ausente.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } as never });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const imediato = data?.redirect_url ?? data?.redirect_to;
    if (imediato && !data?.client) throw redirect({ href: imediato });
    return data;
  },
  component: Consentimento,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 text-sm">
      Não foi possível carregar este pedido de autorização:{" "}
      {String((error as Error)?.message ?? error)}
    </main>
  ),
  head: () => ({
    meta: [
      { title: "Autorizar acesso — Health Hub Pro" },
      {
        name: "description",
        content: "Aprove ou recuse o acesso de um assistente externo à sua conta do Health Hub Pro.",
      },
      { property: "og:title", content: "Autorizar acesso — Health Hub Pro" },
      {
        property: "og:description",
        content: "Aprove ou recuse o acesso de um assistente externo à sua conta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Consentimento() {
  const detalhes = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nome = detalhes?.client?.name ?? "o aplicativo";

  async function decidir(aprovar: boolean) {
    setOcupado(true);
    setErro(null);
    const api = oauthApi();
    const { data, error } = aprovar
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setOcupado(false);
      setErro(error.message);
      return;
    }
    const destino = data?.redirect_url ?? data?.redirect_to;
    if (!destino) {
      setOcupado(false);
      setErro("O servidor de autorização não devolveu um endereço de retorno.");
      return;
    }
    window.location.href = destino;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </span>
          <h1 className="text-lg font-semibold">Conectar {nome} à sua conta</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Ao aprovar, {nome} poderá consultar clínicas, médicos, pacientes e agendamentos com as
          mesmas permissões que você tem no Health Hub Pro. Nenhum dado é alterado por essas
          ferramentas — elas são somente de leitura.
        </p>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <div className="flex gap-3">
          <Button className="flex-1" disabled={ocupado} onClick={() => decidir(true)}>
            Aprovar
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            disabled={ocupado}
            onClick={() => decidir(false)}
          >
            Recusar
          </Button>
        </div>
      </div>
    </main>
  );
}
