import { describe, expect, it } from "bun:test";
import { criarCacheConversas, respostaAindaVale } from "../conversa-cache";

const conteudo = (marca: string) => ({
  msgs: [{ id: marca }],
  contato: { id: marca },
  notas: [],
  eventos: [],
});

describe("cache por conversa", () => {
  it("guarda e devolve o conteúdo pela chave da conversa", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", conteudo("a"));
    cache.guardar("B", conteudo("b"));
    expect(cache.obter("A")?.msgs[0].id).toBe("a");
    expect(cache.obter("B")?.msgs[0].id).toBe("b");
  });

  it("nunca devolve conteúdo de outra conversa", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", conteudo("a"));
    expect(cache.obter("B")).toBeUndefined();
  });

  it("invalida e limpa", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", conteudo("a"));
    cache.invalidar("A");
    expect(cache.obter("A")).toBeUndefined();
    cache.guardar("B", conteudo("b"));
    cache.limpar();
    expect(cache.tamanho()).toBe(0);
  });

  it("descarta as conversas menos usadas quando passa do limite", () => {
    const cache = criarCacheConversas(2);
    cache.guardar("A", conteudo("a"));
    cache.guardar("B", conteudo("b"));
    cache.obter("A"); // A vira a mais recente
    cache.guardar("C", conteudo("c"));
    expect(cache.tamanho()).toBe(2);
    expect(cache.obter("B")).toBeUndefined();
    expect(cache.obter("A")?.msgs[0].id).toBe("a");
  });
});

describe("respostas fora de ordem", () => {
  it("aceita a resposta da conversa selecionada e do pedido mais recente", () => {
    expect(
      respostaAindaVale({ alvo: "B", selecionadaAgora: "B", pedido: 3, pedidoAtual: 3 }),
    ).toBe(true);
  });

  it("descarta resposta da conversa anterior que chegou atrasada", () => {
    expect(
      respostaAindaVale({ alvo: "A", selecionadaAgora: "B", pedido: 1, pedidoAtual: 2 }),
    ).toBe(false);
  });

  it("descarta pedido superado da mesma conversa", () => {
    expect(
      respostaAindaVale({ alvo: "B", selecionadaAgora: "B", pedido: 2, pedidoAtual: 5 }),
    ).toBe(false);
  });

  it("descarta quando não há conversa selecionada", () => {
    expect(
      respostaAindaVale({ alvo: "A", selecionadaAgora: null, pedido: 1, pedidoAtual: 1 }),
    ).toBe(false);
  });

  it("troca rápida entre cinco conversas mantém só a última", () => {
    const ordem = ["A", "B", "C", "D", "E"];
    const pedidos = ordem.map((id, i) => ({ alvo: id, pedido: i + 1 }));
    const aceitos = pedidos.filter((p) =>
      respostaAindaVale({
        alvo: p.alvo,
        selecionadaAgora: "E",
        pedido: p.pedido,
        pedidoAtual: 5,
      }),
    );
    expect(aceitos.map((a) => a.alvo)).toEqual(["E"]);
  });
});
