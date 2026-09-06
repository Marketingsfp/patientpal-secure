/**
 * Canal de pedido de seleção de conversa. A automação nunca troca de endereço
 * nem remonta a Inbox: ela apenas pede a mesma seleção interna por id que a
 * lista já usa, e a Inbox responde com o seu próprio mecanismo.
 */
type Ouvinte = (conversaId: string) => void;

const ouvintes = new Set<Ouvinte>();

export function assinarSelecaoConversa(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function pedirSelecaoConversa(conversaId: string): void {
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(conversaId);
    } catch {
      // Ignora tela que não conseguiu aplicar a seleção.
    }
  }
}
