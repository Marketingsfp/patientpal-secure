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

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lê o id da conversa direto do endereço (`/app/nina/<uuid>`).
 *
 * A Inbox é renderizada pela rota-mãe `/app/nina`; nesse ponto os parâmetros
 * da rota-filha não chegam ao componente, então a leitura do endereço é feita
 * pelo caminho. Só aceita id no formato interno — nada de nome, telefone,
 * protocolo ou número visível da conversa.
 */
export function idConversaDaUrl(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = /^\/app\/nina\/([^/?#]+)/.exec(pathname.trim());
  if (!m?.[1]) return null;
  let id = m[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    /* endereço malformado: usa o texto cru */
  }
  return RE_UUID.test(id) ? id : null;
}
