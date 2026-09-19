import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ClinicaProvider } from "@/hooks/use-clinica";

import { supabase } from "@/integrations/supabase/client";
import { isMedicoOnlyUser } from "@/lib/medico-only";
import { lerSessaoEmCache } from "@/lib/sessao-cache";

export const Route = createFileRoute("/_authenticated")({
  // Gate executado antes de renderizar qualquer rota /app/*.
  // SSR desligado porque a sessão Supabase vive em localStorage.
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Nada é desenhado na tela enquanto esta função não termina. Por isso ela
    // não pode depender de a rede responder: uma falha aqui deixava a página
    // em branco ou expulsava para o login quem estava logado. Quando a
    // consulta de sessão falha, valem os dados que o próprio Supabase guardou
    // no navegador (token vencido é descartado lá).
    // `getSession()` não é só leitura local: o SDK do Supabase serializa essa
    // chamada num cadeado (Web Locks) e pode renovar o token pela rede. Quando
    // esse cadeado fica preso — outra aba, renovação que não responde — a
    // chamada NUNCA devolve. Como `beforeLoad` roda a cada troca de tela, o
    // sistema inteiro congelava: clicar no menu lateral não abria nada e a tela
    // continuava a mesma, sem erro nenhum. O `try/catch` não pegava isso,
    // porque travar não é falhar. Agora a espera tem prazo: passou de 2s,
    // seguimos com a sessão que o próprio Supabase guardou no navegador — a
    // mesma que já era o plano B de rede instável, e que descarta token vencido.
    let sessao = null;
    try {
      const comPrazo = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 2000);
      });
      const consulta = supabase.auth
        .getSession()
        .then(({ data, error }) => (error ? null : data.session));
      sessao = await Promise.race([consulta, comPrazo]);
    } catch {
      /* rede instável — cai no plano B abaixo */
    }
    if (!sessao) sessao = lerSessaoEmCache();
    if (!sessao) {
      throw redirect({ to: "/login" });
    }
    // Quem só é médico entra direto na fila de atendimento do dia, em vez de
    // parar no seletor de portais. Antes ele era desviado para a tela
    // simplificada `/medico`, que não tem menu lateral nenhum — o médico
    // ficava sem caminho para o prontuário e sem as demais telas do perfil.
    // Só a raiz "/app" é desviada: qualquer outra tela que ele abrir continua
    // valendo, com o menu normal filtrado pelas permissões do perfil Médico.
    const raizDoApp = location.pathname === "/app" || location.pathname === "/app/";
    const uid = sessao.user?.id;
    let soMedico = false;
    if (raizDoApp && uid) {
      try {
        soMedico = await isMedicoOnlyUser(uid);
      } catch {
        // Falhar essa consulta só significa não saber o atalho do médico. Não
        // pode virar tela branca: sem ela o usuário cai no seletor de portais,
        // que é uma tela válida.
        soMedico = false;
      }
    }
    if (soMedico) {
      throw redirect({ to: "/app/atendimento-ia" });
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
