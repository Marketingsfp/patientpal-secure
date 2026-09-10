/**
 * Fonte única de verdade para o indicador visual "Nina" no card da conversa.
 *
 * Existiam duas condições independentes representando o MESMO conceito
 * (status "bot_attending" e owner_type "AI"), o que renderizava dois badges
 * idênticos no mesmo card. A camada visual passa a consultar apenas esta
 * função e renderizar no máximo UM indicador.
 *
 * Não altera comportamento da Nina, atribuição, filtros ou estado.
 */
export type ConversaIndicadorNina = {
  status?: string | null;
  owner_type?: string | null;
};

/** true quando a conversa deve exibir exatamente um indicador "✦ Nina". */
export function conversaEhDaNina(c: ConversaIndicadorNina | null | undefined): boolean {
  if (!c) return false;
  return c.owner_type === "AI" || c.status === "bot_attending";
}

/**
 * true quando o badge de status seria apenas uma segunda representação da
 * Nina e, portanto, não deve ser renderizado junto do indicador canônico.
 */
export function statusEhRepresentacaoDaNina(status?: string | null): boolean {
  return status === "bot_attending";
}
