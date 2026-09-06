import { describe, expect, it } from "bun:test";
import { criarPrefetchStore, chavePrefetch } from "../prefetch-cache";

const CH = chavePrefetch("clinica-1", "user-1");

describe("controle de pré-carregamento das conversas", () => {
  it("reaproveita a mesma busca quando o lead é clicado durante o pré-carregamento", () => {
    const store = criarPrefetchStore<string[]>();
    const p = Promise.resolve(["m1"]);
    store.registrar("A", CH, p);
    expect(store.obter("A", CH)?.promise).toBe(p);
    expect(store.emVoo()).toBe(1);
  });

  it("busca de outra clínica/usuário não é reaproveitada", () => {
    const store = criarPrefetchStore<string[]>();
    store.registrar("A", CH, Promise.resolve([]));
    expect(store.obter("A", chavePrefetch("clinica-2", "user-1"))).toBeUndefined();
    expect(store.obter("A", chavePrefetch("clinica-1", "user-2"))).toBeUndefined();
  });

  it("resultado anterior à invalidação não repovoa o cache", () => {
    const store = criarPrefetchStore<string[]>();
    const e = store.registrar("A", CH, Promise.resolve([]));
    store.invalidar("A"); // chegou mensagem nova nessa conversa
    expect(store.resultadoValido("A", e, CH)).toBe(false);
    expect(store.obter("A", CH)).toBeUndefined();
  });

  it("resultado válido continua podendo alimentar o cache", () => {
    const store = criarPrefetchStore<string[]>();
    const e = store.registrar("A", CH, Promise.resolve([]));
    expect(store.resultadoValido("A", e, CH)).toBe(true);
  });

  it("conclusão só remove a própria busca", () => {
    const store = criarPrefetchStore<string[]>();
    const antiga = store.registrar("A", CH, Promise.resolve([]));
    store.invalidar("A");
    const nova = store.registrar("A", CH, Promise.resolve([]));
    store.concluir("A", antiga);
    expect(store.obter("A", CH)).toBe(nova);
    store.concluir("A", nova);
    expect(store.obter("A", CH)).toBeUndefined();
  });

  it("uma conversa nunca invalida a busca de outra", () => {
    const store = criarPrefetchStore<string[]>();
    const a = store.registrar("A", CH, Promise.resolve([]));
    const b = store.registrar("B", CH, Promise.resolve([]));
    store.invalidar("A");
    expect(store.resultadoValido("A", a, CH)).toBe(false);
    expect(store.resultadoValido("B", b, CH)).toBe(true);
  });

  it("troca de contexto derruba tudo que está em voo", () => {
    const store = criarPrefetchStore<string[]>();
    const a = store.registrar("A", CH, Promise.resolve([]));
    store.limpar();
    expect(store.emVoo()).toBe(0);
    expect(store.resultadoValido("A", a, CH)).toBe(false);
  });

  it("depois de concluir, uma nova tentativa é permitida (falha não trava)", () => {
    const store = criarPrefetchStore<string[]>();
    const e = store.registrar("A", CH, Promise.reject(new Error("falhou")).catch(() => []));
    store.concluir("A", e);
    expect(store.obter("A", CH)).toBeUndefined();
    const nova = store.registrar("A", CH, Promise.resolve([]));
    expect(store.obter("A", CH)).toBe(nova);
  });
});
