/**
 * Cache por conversa + proteção contra respostas fora de ordem na tela de
 * atendimento.
 *
 * Regras (Fase 3):
 * - Todo dado é guardado com a chave do `conversaId`; nunca existe um "último
 *   conteúdo" global que possa vazar de um paciente para outro.
 * - Ao abrir uma conversa já visitada, o conteúdo em cache dela aparece na
 *   hora e é revalidado em segundo plano.
 * - Respostas de requisições antigas (conversa trocada ou pedido superado)
 *   são descartadas.
 */

export type ConteudoConversa = {
  msgs: any[];
  contato: any;
  notas: any[];
  eventos: any[];
};

export type CacheConversas = {
  obter: (conversaId: string) => ConteudoConversa | undefined;
  guardar: (conversaId: string, conteudo: ConteudoConversa) => void;
  invalidar: (conversaId: string) => void;
  limpar: () => void;
  tamanho: () => number;
};

/** Cache LRU simples, limitado para não crescer sem controle. */
export function criarCacheConversas(limite = 10): CacheConversas {
  const mapa = new Map<string, ConteudoConversa>();
  return {
    obter(conversaId) {
      const v = mapa.get(conversaId);
      if (v) {
        // Reinsere para marcar como usada recentemente.
        mapa.delete(conversaId);
        mapa.set(conversaId, v);
      }
      return v;
    },
    guardar(conversaId, conteudo) {
      if (!conversaId) return;
      mapa.delete(conversaId);
      mapa.set(conversaId, conteudo);
      while (mapa.size > limite) {
        const maisAntiga = mapa.keys().next().value as string | undefined;
        if (maisAntiga === undefined) break;
        mapa.delete(maisAntiga);
      }
    },
    invalidar(conversaId) {
      mapa.delete(conversaId);
    },
    limpar() {
      mapa.clear();
    },
    tamanho() {
      return mapa.size;
    },
  };
}

/**
 * Decide se a resposta de uma requisição ainda deve ser aplicada na tela.
 * Só é aceita quando pertence à conversa selecionada agora E é o pedido mais
 * recente feito para essa conversa.
 */
export function respostaAindaVale(params: {
  alvo: string;
  selecionadaAgora: string | null;
  pedido: number;
  pedidoAtual: number;
}): boolean {
  const { alvo, selecionadaAgora, pedido, pedidoAtual } = params;
  if (!alvo) return false;
  if (alvo !== selecionadaAgora) return false;
  return pedido === pedidoAtual;
}
