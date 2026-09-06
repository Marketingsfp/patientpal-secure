/**
 * Abertura central de conversas de atendimento.
 *
 * DECISÃO ATUAL (substitui a estratégia anterior de URL por conversa):
 * a conversa aberta é definida por uma SELEÇÃO INTERNA da Inbox, usando o id
 * interno e imutável da conversa (`conversation_id`). A tela de atendimento
 * mantém sempre o mesmo endereço-base (`/app/nina`).
 *
 * O número visível (#1342) serve para identificar, copiar e buscar — nunca
 * vira endereço, parâmetro ou fragmento. Endereços individuais antigos
 * (`/app/nina/<id>`) foram descontinuados e apenas redirecionam para a Inbox.
 *
 * Abrir uma conversa é só visualização: não altera responsável, fila, status
 * nem quem é o agente (Nina ou humano).
 */

export const ROTA_ATENDIMENTO = "/app/nina" as const;

/** Destino de navegação: sempre a Inbox, nunca um endereço por conversa. */
export type DestinoConversa = { to: typeof ROTA_ATENDIMENTO; replace: boolean };

export function destinoInbox(opcoes: { replace?: boolean } = {}): DestinoConversa {
  return { to: ROTA_ATENDIMENTO, replace: opcoes.replace ?? false };
}

/**
 * Seleção interna pedida: normaliza o id recebido por qualquer ponto do
 * sistema (lista, busca, Central de Atenção, alertas, atalhos).
 * Só o id interno abre conversa — nome, telefone, protocolo, posição na lista
 * ou o número visível não são aceitos aqui.
 */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idConversaValido(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const limpo = id.trim();
  return RE_UUID.test(limpo) ? limpo : null;
}
