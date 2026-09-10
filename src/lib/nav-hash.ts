/**
 * Navegação de itens do menu lateral que compartilham a mesma rota e se
 * diferenciam por hash (ex.: /app/nina#homologacao).
 *
 * Só apresentação/navegação: nenhuma regra de negócio depende deste módulo.
 */
export type NavLeafLike = { to: string; hash?: string };

/** Destino completo do item: rota + hash quando houver. */
export function hrefDoNavLeaf(item: NavLeafLike): string {
  return `${item.to}${item.hash ? `#${item.hash}` : ""}`;
}

/** Chave estável de renderização (rota + hash), evita keys duplicadas. */
export function chaveDoNavLeaf(item: NavLeafLike): string {
  return hrefDoNavLeaf(item);
}

/**
 * Item ativo: a rota precisa bater e, se o item declara hash, o hash atual
 * precisa ser exatamente o dele.
 */
export function navLeafAtivo(
  rotaCombina: boolean,
  hashAtual: string | undefined,
  hashDoItem?: string,
): boolean {
  if (!rotaCombina) return false;
  if (!hashDoItem) return true;
  return (hashAtual ?? "").replace(/^#/, "") === hashDoItem;
}
