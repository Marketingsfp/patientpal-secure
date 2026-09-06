/**
 * Avisos de atualização para a interface depois de uma operação feita pela
 * automação. Usa o mecanismo de recarga que cada tela já possui — nada de
 * recarregar a página ou remontar a conversa inteira.
 */
export type EscopoAtualizacao = "atendimento" | "teste-nina" | "catalogo";

type Ouvinte = () => void;

const ouvintes = new Map<EscopoAtualizacao, Set<Ouvinte>>();

export function assinarAtualizacao(escopo: EscopoAtualizacao, ouvinte: Ouvinte): () => void {
  const atual = ouvintes.get(escopo) ?? new Set<Ouvinte>();
  atual.add(ouvinte);
  ouvintes.set(escopo, atual);
  return () => {
    atual.delete(ouvinte);
  };
}

export function notificarAtualizacao(escopo: EscopoAtualizacao): void {
  for (const ouvinte of ouvintes.get(escopo) ?? []) {
    try {
      ouvinte();
    } catch {
      // Uma tela com erro de recarga não pode derrubar as demais.
    }
  }
}
