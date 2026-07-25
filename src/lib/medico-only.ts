import { supabase } from "@/integrations/supabase/client";

// Cache por usuário. O `beforeLoad` de `/_authenticated` chama esta função a
// cada navegação — o TanStack Router não aplica staleTime a `beforeLoad`
// (diferente do `loader`), então sem cache toda troca de aba do sistema ficava
// bloqueada por uma ida ao banco. O conjunto de papéis do usuário não muda no
// meio da sessão; se mudar, o logout/login limpa o cache via `limparCacheMedicoOnly`.
const cache = new Map<string, Promise<boolean>>();

async function consultarMedicoOnly(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("role, ativo")
    .eq("user_id", userId)
    .eq("ativo", true);
  if (error || !data || data.length === 0) return false;
  return data.every((m) => (m.role ?? "").toLowerCase() === "medico");
}

/**
 * Retorna true se o usuário atual só tem memberships com role='medico'
 * (ou seja, deve ver a interface simplificada do médico, sem menu lateral).
 *
 * Se ele tiver qualquer outro papel (admin, recepcao, financeiro...) numa
 * clínica ativa, retorna false e ele entra no /app normal.
 *
 * O resultado fica em cache na memória da aba (ver comentário acima).
 */
export function isMedicoOnlyUser(userId: string): Promise<boolean> {
  const emCache = cache.get(userId);
  if (emCache) return emCache;
  // Falha não é cacheada: um erro de rede não pode congelar o usuário fora do
  // /app até ele recarregar a página.
  const p = consultarMedicoOnly(userId).catch((e) => {
    cache.delete(userId);
    throw e;
  });
  cache.set(userId, p);
  return p;
}

/** Descarta o cache — chamar ao trocar de sessão (login/logout). */
export function limparCacheMedicoOnly(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Mesma verificação, porém sob uma sessão já conhecida (usa auth.getUser()). */
export async function currentUserIsMedicoOnly(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return false;
  return isMedicoOnlyUser(uid);
}
