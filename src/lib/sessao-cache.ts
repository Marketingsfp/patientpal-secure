import type { Session } from "@supabase/supabase-js";

/**
 * Sessão do Supabase guardada pelo próprio SDK no armazenamento do navegador.
 *
 * Serve de plano B quando a chamada de rede a `auth.getSession()` demora ou
 * falha: sem ela o sistema mandava o usuário de volta para o login a cada
 * oscilação de internet.
 *
 * Uma sessão VENCIDA nunca é devolvida. Esse era o defeito que prendia o
 * médico numa tela branca: a página de login enxergava o token velho no
 * armazenamento, concluía que o usuário já estava logado e mandava para
 * `/app/atendimento-ia`; lá a verificação de verdade não achava sessão e
 * devolvia para o login — e o navegador ficava nesse vai e volta, sem nunca
 * desenhar nada.
 */
export function lerSessaoEmCache(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const cached = parsed?.currentSession ?? parsed;
      if (!cached?.access_token || !cached?.user) continue;
      // `expires_at` vem em segundos. A margem de 10s evita aceitar um token
      // que vence no meio do carregamento da página.
      const expiraEm = Number(cached.expires_at ?? 0);
      if (expiraEm && expiraEm * 1000 <= Date.now() + 10_000) continue;
      return cached as Session;
    }
  } catch {
    return null;
  }
  return null;
}
