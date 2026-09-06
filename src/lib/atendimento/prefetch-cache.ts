/**
 * Controle do pré-carregamento (hover) das conversas.
 *
 * Ele existe para evitar dois problemas conhecidos:
 *
 * 1. pedir as mesmas mensagens duas vezes (passar o mouse e depois clicar);
 * 2. uma busca antiga voltar depois de a conversa ter sido invalidada (mensagem
 *    nova, transferência, troca de clínica/usuário) e repovoar o cache com
 *    conteúdo velho.
 *
 * Não é um cache novo: guarda apenas as buscas em andamento. O conteúdo
 * continua sendo guardado no cache por conversa já existente.
 */
export type EntradaPrefetch<T> = {
  readonly promise: Promise<T>;
  /** Contexto (clínica + usuário) em que a busca começou. */
  readonly chave: string;
  /** Versão da conversa no momento em que a busca começou. */
  readonly epoca: number;
};

export type PrefetchStore<T> = {
  obter(id: string, chave: string): EntradaPrefetch<T> | undefined;
  registrar(id: string, chave: string, promise: Promise<T>): EntradaPrefetch<T>;
  /** Resultado ainda pode ser gravado no cache? */
  resultadoValido(id: string, entrada: EntradaPrefetch<T>, chave: string): boolean;
  /** Encerra a busca (só remove se ainda for a mesma). */
  concluir(id: string, entrada: EntradaPrefetch<T>): void;
  /** Conversa mudou: buscas em voo dela deixam de valer. */
  invalidar(id: string): void;
  /** Troca de clínica/usuário: nada em voo continua valendo. */
  limpar(): void;
  emVoo(): number;
};

export function criarPrefetchStore<T>(): PrefetchStore<T> {
  const mapa = new Map<string, EntradaPrefetch<T>>();
  const epocas = new Map<string, number>();
  const epocaDe = (id: string) => epocas.get(id) ?? 0;

  const store: PrefetchStore<T> = {
    obter(id, chave) {
      const e = mapa.get(id);
      if (!e) return undefined;
      if (e.chave !== chave || e.epoca !== epocaDe(id)) return undefined;
      return e;
    },
    registrar(id, chave, promise) {
      const e: EntradaPrefetch<T> = { promise, chave, epoca: epocaDe(id) };
      mapa.set(id, e);
      return e;
    },
    resultadoValido(id, entrada, chave) {
      return entrada.chave === chave && entrada.epoca === epocaDe(id);
    },
    concluir(id, entrada) {
      if (mapa.get(id) === entrada) mapa.delete(id);
    },
    invalidar(id) {
      epocas.set(id, epocaDe(id) + 1);
      mapa.delete(id);
    },
    limpar() {
      mapa.clear();
      for (const id of epocas.keys()) epocas.set(id, epocaDe(id) + 1);
    },
    emVoo() {
      return mapa.size;
    },
  };
  return store;
}

/** Contexto atual das buscas: clínica + usuário logado. */
export function chavePrefetch(clinicaId: string | null, userId: string | null): string {
  return `${clinicaId ?? "-"}|${userId ?? "-"}`;
}
