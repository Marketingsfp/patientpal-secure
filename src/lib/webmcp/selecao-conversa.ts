/**
 * Canal de pedido de seleção de conversa. A automação nunca troca de endereço
 * nem remonta a Inbox: ela apenas pede a mesma seleção interna por id que a
 * lista já usa, e a Inbox responde com o seu próprio mecanismo.
 */
type Ouvinte = (conversaId: string) => void;

const ouvintes = new Set<Ouvinte>();
// Pedido feito enquanto a Inbox ainda não estava montada (ex.: clique na aba
// "Pesquisar conversas", que troca de aba e só então monta a Inbox). Fica
// guardado por pouco tempo e é entregue assim que a Inbox se inscreve.
let pendente: { id: string; em: number } | null = null;
const VALIDADE_PENDENTE_MS = 15_000;

export function assinarSelecaoConversa(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  if (pendente && Date.now() - pendente.em < VALIDADE_PENDENTE_MS) {
    const id = pendente.id;
    pendente = null;
    try {
      ouvinte(id);
    } catch {
      // Ignora tela que não conseguiu aplicar a seleção.
    }
  } else {
    pendente = null;
  }
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function pedirSelecaoConversa(conversaId: string): void {
  if (ouvintes.size === 0) {
    pendente = { id: conversaId, em: Date.now() };
    return;
  }
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(conversaId);
    } catch {
      // Ignora tela que não conseguiu aplicar a seleção.
    }
  }
}
