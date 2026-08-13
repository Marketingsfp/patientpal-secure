/**
 * Cache in-memory com TTL + "single flight" (deduplicação de chamadas em voo).
 *
 * Motivação: várias partes da mesma tela pedem a MESMA lista ao mesmo tempo
 * (ex.: a Agenda pedia `medicos` 14x e `procedimentos` 10x na abertura).
 * Um cache simples com TTL não resolve isso, porque as chamadas paralelas
 * acontecem ANTES da primeira resposta chegar — todas erram o cache.
 * Aqui, a segunda chamada reaproveita a Promise da primeira.
 */
export type SingleFlightCache<T> = {
  get(key: string, loader: () => Promise<T>): Promise<T>;
  peek(key: string): T | null;
  invalidate(key?: string): void;
};

export function makeCache<T>(ttlMs: number): SingleFlightCache<T> {
  const store = new Map<string, { ts: number; data: T }>();
  const inflight = new Map<string, Promise<T>>();

  return {
    peek(key) {
      const hit = store.get(key);
      if (!hit) return null;
      return Date.now() - hit.ts < ttlMs ? hit.data : null;
    },
    async get(key, loader) {
      const hit = store.get(key);
      if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
      const running = inflight.get(key);
      if (running) return running;
      const p = loader()
        .then((data) => {
          store.set(key, { ts: Date.now(), data });
          return data;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
    invalidate(key) {
      if (key) {
        store.delete(key);
        inflight.delete(key);
        return;
      }
      store.clear();
      inflight.clear();
    },
  };
}
