// Anexa o token da sessão em TODAS as chamadas ao servidor.
//
// Por que não usamos o anexador gerado: ele depende só de
// `supabase.auth.getSession()`. Quando essa consulta falha, demora ou devolve
// vazio por um instante (rede oscilando, aba recém-aberta), a chamada saía sem
// token e o servidor respondia "Unauthorized: No authorization header
// provided" — com tela em branco para o usuário. Aqui, nesse caso, vale a
// sessão válida que o próprio Supabase já guardou no navegador (token vencido
// é descartado em `lerSessaoEmCache`).
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lerSessaoEmCache } from "@/lib/sessao-cache";

export const anexarTokenSessao = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      /* rede instável — cai no plano B abaixo */
    }
    if (!token) token = lerSessaoEmCache()?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);
