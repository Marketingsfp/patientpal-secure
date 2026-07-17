import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ClinicaProvider } from "@/hooks/use-clinica";
import { supabase } from "@/integrations/supabase/client";
import { isMedicoOnlyUser } from "@/lib/medico-only";

export const Route = createFileRoute("/_authenticated")({
  // Gate executado antes de renderizar qualquer rota /app/*.
  // SSR desligado porque a sessão Supabase vive em localStorage.
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw redirect({ to: "/login" });
    }
    // Usuários que são apenas médicos vão para a interface simplificada,
    // sem menu lateral.
    const uid = data.session.user?.id;
    if (uid && (await isMedicoOnlyUser(uid))) {
      throw redirect({ to: "/medico" });
    }
  },
  component: AuthenticatedApp,
  head: () => ({ meta: [{ title: "ClinicaOS" }] }),
});

function AuthenticatedApp() {
  return (
    <ClinicaProvider>
      <AppShell />
    </ClinicaProvider>
  );
}