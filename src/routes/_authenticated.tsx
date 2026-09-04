import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ClinicaProvider } from "@/hooks/use-clinica";
import { useAutoReloadOnNewBuild } from "@/hooks/use-auto-reload-on-new-build";
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
  // Aviso de versão nova para TODAS as telas do sistema. Antes só a tela do
  // Caixa checava: os computadores da recepção ficam com a Agenda aberta o dia
  // inteiro e nunca souberam de uma publicação nova, então a equipe seguia
  // usando a versão antiga e relatando como defeito um problema já corrigido.
  useAutoReloadOnNewBuild(true);
  return (
    <ClinicaProvider>
      <AppShell />
    </ClinicaProvider>
  );
}
