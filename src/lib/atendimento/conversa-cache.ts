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
  chaves: () => string[];
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
    chaves() {
      return [...mapa.keys()];
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

/**
 * Quais conversas em cache ficaram desatualizadas depois de uma atualização da
 * lista (realtime). Comparamos o instante da última mensagem: se mudou, o
 * conteúdo guardado daquela conversa não vale mais.
 *
 * Cada conversa é avaliada isoladamente pelo seu próprio id — o cache de uma
 * nunca é usado nem invalidado pelo movimento de outra.
 */
export function conversasDesatualizadas(params: {
  anteriores: { id: string; ultima_mensagem_em?: string | null }[];
  atuais: { id: string; ultima_mensagem_em?: string | null }[];
  emCache: string[];
}): string[] {
  const antes = new Map(params.anteriores.map((c) => [c.id, c.ultima_mensagem_em ?? null]));
  const cacheados = new Set(params.emCache);
  const fora: string[] = [];
  for (const c of params.atuais) {
    if (!cacheados.has(c.id)) continue;
    const anterior = antes.get(c.id);
    const agora = c.ultima_mensagem_em ?? null;
    if (anterior === undefined) continue;
    if (anterior !== agora) fora.push(c.id);
  }
  return fora;
}
