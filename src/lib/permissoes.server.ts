// Autorização por módulo NO SERVIDOR.
//
// Por que este arquivo existe: até aqui, a única barreira por módulo do sistema
// era visual. `src/components/app-shell.tsx` esconde os itens de menu e mostra
// "Sem permissão" — mas isso roda no navegador do usuário. As server functions
// exigiam apenas `requireSupabaseAuth` (ou seja: "está logado?"), e as policies
// de RLS mais antigas só perguntavam `is_member` ("é desta clínica?").
//
// Resultado: quem soubesse chamar a server function direto — ou simplesmente
// abrir o console do navegador — acessava módulos que o perfil dele não libera.
//
// A fonte de verdade da autorização é a mesma que a tela de Perfis de Acesso
// usa: a função `has_module_access` no banco, sobre `perfis_acesso` +
// `perfil_permissoes`. Ela é fail-closed (perfil sem configuração = negado) e
// trata admin como acesso total.
//
// Usamos a assinatura de 4 argumentos porque é a que o `types.ts` gerado a
// partir do banco de produção confirma existir, e ela já tem GRANT EXECUTE
// para `authenticated`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type NivelAcesso = "read" | "write";

type Cliente = SupabaseClient<Database>;

/**
 * Confirma que o usuário tem vínculo ATIVO com a clínica.
 *
 * Fica separado de `assertModulo` porque a mensagem de erro é diferente e
 * porque nem toda checagem precisa das duas (mas quase todas precisam).
 */
export async function assertMembroDaClinica(
  supabase: Cliente,
  userId: string,
  clinicaId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

/**
 * Confirma que o perfil do usuário libera `modulo` no nível pedido.
 *
 * Fail-closed em todos os caminhos: erro na chamada, resposta nula ou `false`
 * derrubam a requisição. Um problema de infraestrutura nunca deve virar
 * permissão concedida.
 */
export async function assertModulo(
  supabase: Cliente,
  userId: string,
  clinicaId: string,
  modulo: string,
  nivel: NivelAcesso = "read",
): Promise<void> {
  const { data, error } = await supabase.rpc("has_module_access", {
    _user_id: userId,
    _clinica_id: clinicaId,
    _modulo: modulo,
    _nivel: nivel,
  });

  if (error) {
    console.error(`[permissoes] falha ao verificar módulo "${modulo}":`, error.message);
    throw new Error("Não foi possível verificar sua permissão. Tente novamente.");
  }

  if (data !== true) {
    throw new Error(`Sem permissão para o módulo "${modulo}" nesta clínica.`);
  }
}

/**
 * Atalho para o caso normal: é da clínica E tem o módulo.
 *
 * A ordem importa para a mensagem de erro: "não é desta clínica" é uma
 * informação diferente de "é daqui, mas não tem este módulo".
 */
export async function assertAcessoModulo(
  supabase: Cliente,
  userId: string,
  clinicaId: string,
  modulo: string,
  nivel: NivelAcesso = "read",
): Promise<void> {
  await assertMembroDaClinica(supabase, userId, clinicaId);
  await assertModulo(supabase, userId, clinicaId, modulo, nivel);
}
