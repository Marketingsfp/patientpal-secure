/**
 * Navegação central para conversas de atendimento (Fase 5).
 *
 * Qualquer módulo que precise abrir uma conversa (Inbox, Central de Atenção,
 * fila, notificações, supervisão, QA) usa este mesmo caminho — nenhuma tela
 * monta o endereço na mão.
 *
 * O identificador da rota é sempre o id interno e imutável da conversa
 * (`conversation_id`), nunca nome, telefone, protocolo, status ou posição.
 *
 * Abrir uma conversa por link é apenas visualização: não altera responsável,
 * fila, status nem quem é o agente (Nina ou humano).
 */

export const ROTA_ATENDIMENTO = "/app/nina" as const;
export const ROTA_CONVERSA = "/app/nina/$conversationId" as const;

export type DestinoConversa =
  | { to: typeof ROTA_ATENDIMENTO; replace: boolean }
  | {
      to: typeof ROTA_CONVERSA;
      params: { conversationId: string };
      replace: boolean;
    };

/** Endereço de uma conversa específica, em texto (para copiar/compartilhar). */
export function urlConversa(conversationId: string): string {
  return `${ROTA_ATENDIMENTO}/${conversationId}`;
}

/**
 * Destino de navegação para uma conversa. Sem id (ou id vazio) volta para a
 * Inbox, mantendo o comportamento atual da tela.
 */
export function destinoConversa(
  conversationId: string | null | undefined,
  opcoes: { replace?: boolean } = {},
): DestinoConversa {
  const replace = opcoes.replace ?? false;
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return { to: ROTA_ATENDIMENTO, replace };
  return { to: ROTA_CONVERSA, params: { conversationId: id }, replace };
}
