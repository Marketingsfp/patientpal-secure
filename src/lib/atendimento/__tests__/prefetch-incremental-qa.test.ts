/**
 * Fase 4 — prefetch por intenção, atualização incremental e não duplicação.
 */
import { describe, expect, it } from "bun:test";
import {
  cursorMaisRecente,
  mesclarNovas,
  mesclarEventos,
  podeAtualizarIncremental,
} from "../atualizacao-incremental";
import { criarCacheConversas } from "../conversa-cache";

const msg = (id: string, min: number) => ({
  id,
  body: id,
  recebida_em: new Date(2026, 0, 1, 10, min).toISOString(),
});

describe("cursor e mesclagem incremental", () => {
  it("usa a mensagem mais recente como referência", () => {
    expect(cursorMaisRecente([msg("a", 1), msg("c", 9), msg("b", 5)])).toBe(
      msg("c", 9).recebida_em,
    );
    expect(cursorMaisRecente([])).toBeNull();
  });

  it("junta mensagens novas sem duplicar e em ordem", () => {
    const atuais = [msg("a", 1), msg("b", 2)];
    const juntas = mesclarNovas(atuais, [msg("b", 2), msg("c", 3)]);
    expect(juntas.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("junta eventos internos sem duplicar", () => {
    const ev = (id: string, min: number) => ({
      id,
      created_at: new Date(2026, 0, 1, 10, min).toISOString(),
    });
    const juntos = mesclarEventos([ev("1", 1)], [ev("1", 1), ev("2", 2)]);
    expect(juntos.map((e) => e.id)).toEqual(["1", "2"]);
  });
});

describe("quando dá para atualizar só o que é novo", () => {
  it("atualiza incrementalmente a conversa aberta e já carregada", () => {
    expect(
      podeAtualizarIncremental({
        conversaAberta: "A",
        conversaCarregada: "A",
        cursor: msg("a", 1).recebida_em,
      }),
    ).toBe(true);
  });

  it("não usa incremento entre conversas diferentes", () => {
    expect(
      podeAtualizarIncremental({
        conversaAberta: "B",
        conversaCarregada: "A",
        cursor: msg("a", 1).recebida_em,
      }),
    ).toBe(false);
  });

  it("sem mensagem na tela, cai na carga normal", () => {
    expect(
      podeAtualizarIncremental({ conversaAberta: "A", conversaCarregada: "A", cursor: null }),
    ).toBe(false);
  });
});

describe("prefetch por intenção (hover) + clique", () => {
  // Simula o comportamento do componente: temporizador de 150ms, uma única
  // busca por conversa, cache parcial e reaproveitamento da busca em voo.
  function criarSimulador() {
    const cache = criarCacheConversas(10);
    const timers = new Map<string, any>();
    const emVoo = new Map<string, Promise<any[]>>();
    let buscas = 0;
    const buscar = async (id: string) => {
      buscas++;
      return [msg(`${id}-1`, 1)];
    };
    return {
      cache,
      get buscas() {
        return buscas;
      },
      hoverEntra(id: string, agendar: (fn: () => void, ms: number) => any) {
        if (timers.has(id)) return;
        timers.set(
          id,
          agendar(() => {
            timers.delete(id);
            if (cache.obter(id) || emVoo.has(id)) return;
            const p = buscar(id);
            emVoo.set(id, p);
            void p.then((m) => {
              if (!cache.obter(id)) {
                cache.guardar(id, { msgs: m, contato: null, notas: [], eventos: [], parcial: true });
              }
            });
          }, 150),
        );
      },
      hoverSai(id: string, cancelar: (t: any) => void) {
        const t = timers.get(id);
        if (t !== undefined) {
          cancelar(t);
          timers.delete(id);
        }
      },
      async clicar(id: string) {
        const reuso = emVoo.get(id);
        emVoo.delete(id);
        return reuso ?? buscar(id);
      },
    };
  }

  it("hover rápido (mouse de passagem) não dispara busca", () => {
    const sim = criarSimulador();
    const agendados: (() => void)[] = [];
    sim.hoverEntra("A", (fn) => {
      agendados.push(fn);
      return 1;
    });
    sim.hoverSai("A", () => agendados.pop());
    expect(sim.buscas).toBe(0);
  });

  it("hover mantido busca uma vez e o clique reaproveita (sem duplicar)", async () => {
    const sim = criarSimulador();
    let disparar: (() => void) | null = null;
    sim.hoverEntra("A", (fn) => {
      disparar = fn;
      return 1;
    });
    disparar!();
    await sim.clicar("A");
    expect(sim.buscas).toBe(1);
  });

  it("clique sem hover busca normalmente", async () => {
    const sim = criarSimulador();
    await sim.clicar("A");
    expect(sim.buscas).toBe(1);
  });

  it("cache do prefetch é parcial e por conversa", async () => {
    const sim = criarSimulador();
    let disparar: (() => void) | null = null;
    sim.hoverEntra("A", (fn) => {
      disparar = fn;
      return 1;
    });
    disparar!();
    await Promise.resolve();
    await Promise.resolve();
    const a = sim.cache.obter("A");
    expect(a?.parcial).toBe(true);
    expect(a?.contato).toBeNull();
    expect(sim.cache.obter("B")).toBeUndefined();
  });
});

describe("mensagem nova em conversa aberta", () => {
  it("atualiza o cache da própria conversa e não o da outra", () => {
    const cache = criarCacheConversas(10);
    cache.guardar("A", { msgs: [msg("a", 1)], contato: { id: "pa" }, notas: [], eventos: [] });
    cache.guardar("B", { msgs: [msg("b", 1)], contato: { id: "pb" }, notas: [], eventos: [] });
    const atual = cache.obter("A")!;
    cache.guardar("A", { ...atual, msgs: mesclarNovas(atual.msgs, [msg("a2", 2)]) });
    expect(cache.obter("A")!.msgs.map((m: any) => m.id)).toEqual(["a", "a2"]);
    expect(cache.obter("B")!.msgs.map((m: any) => m.id)).toEqual(["b"]);
  });

  it("reaplicar a mesma mensagem não muda a lista (sem flicker)", () => {
    const atuais = [msg("a", 1), msg("b", 2)];
    const r1 = mesclarNovas(atuais, [msg("b", 2)]);
    const r2 = mesclarNovas(r1, [msg("b", 2)]);
    expect(r1.map((m) => m.id)).toEqual(["a", "b"]);
    expect(r2.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
