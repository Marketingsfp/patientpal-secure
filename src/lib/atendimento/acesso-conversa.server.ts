/**
 * Guarda de acesso direto a uma conversa (abertura por URL).
 *
 * Conhecer a URL não dá acesso: além do RLS e da associação à clínica, o
 * backend confere se a conversa está dentro de algum escopo que ESTE usuário
 * pode ver (Minhas, Nina, Não atribuídas, Fechadas ou Equipe para gestores).
 * Só depois disso mensagens, contato, resumo, notas e eventos são carregados.
 *
 * A verificação é somente de leitura: nunca altera responsável, fila, status
 * ou o dono (Nina/Humano) da conversa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { usuarioPodeVerConversa, type ConversaEscopo } from "./escopo-inbox";

export const ERRO_CONVERSA_NAO_ENCONTRADA = "CONVERSA_NAO_ENCONTRADA";
export const ERRO_CONVERSA_SEM_PERMISSAO = "CONVERSA_SEM_PERMISSAO";

export const MSG_CONVERSA_NAO_ENCONTRADA = "Conversa não encontrada.";
export const MSG_CONVERSA_SEM_PERMISSAO =
  "Você não possui permissão para visualizar esta conversa.";

export type MotivoAcessoNegado =
  | typeof ERRO_CONVERSA_NAO_ENCONTRADA
  | typeof ERRO_CONVERSA_SEM_PERMISSAO;

export class AcessoConversaNegado extends Error {
  motivo: MotivoAcessoNegado;
  constructor(motivo: MotivoAcessoNegado) {
    super(
      motivo === ERRO_CONVERSA_NAO_ENCONTRADA
        ? MSG_CONVERSA_NAO_ENCONTRADA
        : MSG_CONVERSA_SEM_PERMISSAO,
    );
    this.motivo = motivo;
    this.name = "AcessoConversaNegado";
  }
}

export async function usuarioEhGestor(
  supabase: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc("can_manage_clinica", {
      _user_id: userId,
      _clinica_id: clinicaId,
    });
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Confere se o usuário pode abrir a conversa. Lança `AcessoConversaNegado`
 * com motivo distinto para "não existe" e "sem permissão".
 */
export async function assertAcessoConversa(
  supabase: SupabaseClient<Database>,
  userId: string,
  clinicaId: string,
  conversaId: string,
): Promise<ConversaEscopo & { id: string; is_teste?: boolean | null }> {
  const { data: conv, error } = await supabase
    .from("atend_conversas")
    .select("id, atribuida_user_id, owner_type, status, is_teste")
    .eq("id", conversaId)
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) throw new AcessoConversaNegado(ERRO_CONVERSA_NAO_ENCONTRADA);

  const gestor = await usuarioEhGestor(supabase, userId, clinicaId);
  if (!usuarioPodeVerConversa(conv, { userId, gestor })) {
    throw new AcessoConversaNegado(ERRO_CONVERSA_SEM_PERMISSAO);
  }
  return conv as ConversaEscopo & { id: string; is_teste?: boolean | null };
}
