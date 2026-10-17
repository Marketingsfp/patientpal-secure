/**
 * Encerramento na tela (17/10/2026): assim que o servidor confirma, a conversa
 * aparece encerrada — sem botão Encerrar e com o envio travado — antes de a
 * lista recarregar. Mesmos campos que `resolverConversaCore` grava no banco;
 * a recarga em segundo plano depois substitui pelos dados oficiais.
 */
type ConversaNaTela = {
  id: string;
  status?: string | null;
  owner_type?: string | null;
  atribuida_user_id?: string | null;
  last_assigned_user_id?: string | null;
  resolved_by?: string | null;
};

export function aplicarEncerramentoLocal<T extends ConversaNaTela>(
  conversa: T,
  conversaId: string,
  userId: string | null,
): T {
  if (conversa?.id !== conversaId) return conversa;
  return {
    ...conversa,
    status: "closed",
    owner_type: "AI",
    atribuida_user_id: null,
    last_assigned_user_id:
      conversa.atribuida_user_id ?? conversa.last_assigned_user_id ?? userId ?? null,
    resolved_by: userId,
  };
}
