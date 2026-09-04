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
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw redirect({ to: "/login" });
    }
    // Quem só é médico entra direto na fila de atendimento do dia, em vez de
    // parar no seletor de portais. Antes ele era desviado para a tela
    // simplificada `/medico`, que não tem menu lateral nenhum — o médico
    // ficava sem caminho para o prontuário e sem as demais telas do perfil.
    // Só a raiz "/app" é desviada: qualquer outra tela que ele abrir continua
    // valendo, com o menu normal filtrado pelas permissões do perfil Médico.
    const raizDoApp = location.pathname === "/app" || location.pathname === "/app/";
    const uid = data.session.user?.id;
    if (raizDoApp && uid && (await isMedicoOnlyUser(uid))) {
      throw redirect({ to: "/app/atendimento-ia" });
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
