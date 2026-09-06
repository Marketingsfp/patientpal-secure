import { describe, expect, it } from "bun:test";
import { criarCacheConversas, conversasDesatualizadas } from "../conversa-cache";
import { criarPrefetchStore, chavePrefetch } from "../prefetch-cache";
import { mesclarNovas } from "../atualizacao-incremental";

const msg = (id: string, em: string) => ({ id, recebida_em: em });

describe("Fase 2 — cache de abertura da conversa", () => {
  it("resposta iniciada antes da invalidação não pode gravar no cache", async () => {
    const store = criarPrefetchStore<any[]>();
    const chave = chavePrefetch("c1", "u1");
    const entrada = store.registrar("A", chave, Promise.resolve([msg("m1", "2026-01-01")]));
    // chega mensagem nova enquanto a busca vinha
    store.invalidar("A");
    expect(store.resultadoValido("A", entrada, chave)).toBe(false);
  });

  it("troca de clínica/usuário invalida a gravação de uma busca em voo", () => {
    const store = criarPrefetchStore<any[]>();
    const entrada = store.registrar("A", chavePrefetch("c1", "u1"), Promise.resolve([]));
    expect(store.resultadoValido("A", entrada, chavePrefetch("c2", "u1"))).toBe(false);
  });

  it("concluir remove só a própria busca, nunca uma mais nova", () => {
    const store = criarPrefetchStore<any[]>();
    const chave = chavePrefetch("c1", "u1");
    const antiga = store.registrar("A", chave, Promise.resolve([]));
    const nova = store.registrar("A", chave, Promise.resolve([]));
    store.concluir("A", antiga);
    expect(store.obter("A", chave)).toBe(nova);
  });

  it("revalidação não troca o histórico já carregado pela janela inicial", () => {
    const historico = [msg("m1", "2026-01-01"), msg("m2", "2026-01-02"), msg("m3", "2026-01-03")];
    const janelaInicial = [msg("m3", "2026-01-03")];
    const visiveis =
      historico.length > janelaInicial.length ? mesclarNovas(historico, janelaInicial) : janelaInicial;
    expect(visiveis.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("completar o cache preserva mensagem que chegou durante a abertura", () => {
    const cache = criarCacheConversas();
    // parcial gravado na abertura + mensagem nova pelo Realtime
    cache.guardar("A", {
      msgs: [msg("m1", "2026-01-01"), msg("m2", "2026-01-02")],
      contato: null,
      notas: [],
      eventos: [],
      parcial: true,
    });
    const daBusca = [msg("m1", "2026-01-01")];
    const base = cache.obter("A")!.msgs;
    cache.guardar("A", {
      msgs: base.length ? mesclarNovas(base, daBusca) : daBusca,
      contato: { nome: "x" } as any,
      notas: [],
      eventos: [],
    });
    expect(cache.obter("A")!.msgs.map((m: any) => m.id)).toEqual(["m1", "m2"]);
    expect(cache.obter("A")!.parcial).toBeFalsy();
  });

  it("apenas a conversa com mensagem nova fica desatualizada", () => {
    const desatualizadas = conversasDesatualizadas({
      anteriores: [
        { id: "A", ultima_msg_em: "2026-01-01T10:00:00Z" },
        { id: "B", ultima_msg_em: "2026-01-01T09:00:00Z" },
      ],
      atuais: [
        { id: "A", ultima_msg_em: "2026-01-01T11:00:00Z" },
        { id: "B", ultima_msg_em: "2026-01-01T09:00:00Z" },
      ],
    });
    expect(desatualizadas).toEqual(["A"]);
  });
});
