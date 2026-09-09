/**
 * Contexto de acesso do envio, carregado UMA vez.
 *
 * Antes (Fase 4), responder uma mensagem disparava, em sequência:
 *   is_member → SELECT atend_conversas → can_manage_clinica →
 *   atend_usuario_e_admin → SELECT atend_conversas de novo.
 *
 * Nenhuma dessas verificações foi removida: elas continuam todas, na mesma
 * ordem de avaliação e com as mesmas mensagens de erro. A diferença é que os
 * dados são buscados em paralelo e a conversa é lida uma única vez, com todas
 * as colunas necessárias.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { usuarioPodeVerConversa } from "./escopo-inbox";
import {
  AcessoConversaNegado,
  ERRO_CONVERSA_NAO_ENCONTRADA,
  ERRO_CONVERSA_SEM_PERMISSAO,
} from "./acesso-conversa.server";

export const COLUNAS_CONVERSA_ENVIO =
  "id, atribuida_user_id, owner_type, status, is_teste, contato_telefone, primeiro_resp_em, aguardando_desde";

export interface ConversaEnvio {
  id: string;
  atribuida_user_id: string | null;
  owner_type: string | null;
  status: string | null;
  is_teste?: boolean | null;
  contato_telefone: string | null;
  primeiro_resp_em: string | null;
  aguardando_desde: string | null;
}

export interface ContextoEnvio {
  userId: string;
  clinicaId: string;
  conversa: ConversaEnvio;
  gestor: boolean;
  admin: boolean;
}

/**
 * Carrega e valida, de uma só vez, tudo que o envio precisa saber sobre quem
 * está enviando e sobre a conversa. Lança exatamente os mesmos erros das
 * verificações individuais.
 */
export async function carregarContextoEnvio(
  supabase: SupabaseClient<Database>,
  params: { userId: string; clinicaId: string; conversaId: string },
): Promise<ContextoEnvio> {
  const { userId, clinicaId, conversaId } = params;

  const [membro, gestorR, adminR, convR] = await Promise.all([
    supabase.rpc("is_member", { _user_id: userId, _clinica_id: clinicaId }),
    supabase.rpc("can_manage_clinica", { _user_id: userId, _clinica_id: clinicaId }),
    supabase.rpc("atend_usuario_e_admin", { _user_id: userId, _clinica_id: clinicaId }),
    supabase
      .from("atend_conversas")
      .select(COLUNAS_CONVERSA_ENVIO)
      .eq("id", conversaId)
      .eq("clinica_id", clinicaId)
      .maybeSingle(),
  ]);

  // 1) associação à clínica
  if (membro.error) throw new Error(membro.error.message);
  if (!membro.data) throw new Error("Sem acesso a esta clínica");

  // 2) a conversa existe dentro desta clínica
  if (convR.error) throw new Error(convR.error.message);
  const conversa = convR.data as ConversaEnvio | null;
  if (!conversa) throw new AcessoConversaNegado(ERRO_CONVERSA_NAO_ENCONTRADA);

  // 3) escopo do inbox (Minhas, Nina, Não atribuídas, Fechadas, Equipe)
  const gestor = !gestorR.error && !!gestorR.data;
  if (!usuarioPodeVerConversa(conversa as any, { userId, gestor })) {
    throw new AcessoConversaNegado(ERRO_CONVERSA_SEM_PERMISSAO);
  }

  // 4) administrador não atende paciente
  if (adminR.error) throw new Error(adminR.error.message);
  const admin = !!adminR.data;

  return { userId, clinicaId, conversa, gestor, admin };
}
