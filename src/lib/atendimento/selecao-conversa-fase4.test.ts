import { describe, expect, it } from "bun:test";
import { criarCacheConversas, respostaAindaVale } from "./conversa-cache";
import { acaoPermitida, gravarRascunho, lerRascunho } from "./rascunhos-conversa";

const base = { pedido: 1, pedidoAtual: 1 };

describe("Fase 4 — carregamento seguro a partir da URL", () => {
  it("A → B: resposta de A é descartada quando a URL já é B", () => {
    expect(
      respostaAindaVale({ ...base, alvo: "A", selecionadaAgora: "A", selecaoAtual: "B" }),
    ).toBe(false);
  });

  it("A → B → C rapidamente: só a conversa da URL atual renderiza", () => {
    expect(
      respostaAindaVale({ ...base, alvo: "B", selecionadaAgora: "C", selecaoAtual: "C" }),
    ).toBe(false);
    expect(
      respostaAindaVale({ ...base, alvo: "C", selecionadaAgora: "C", selecaoAtual: "C" }),
    ).toBe(true);
  });

  it("resposta antiga da mesma conversa (pedido vencido) é ignorada", () => {
    expect(
      respostaAindaVale({
        alvo: "A",
        selecionadaAgora: "A",
        selecaoAtual: "A",
        pedido: 1,
        pedidoAtual: 2,
      }),
    ).toBe(false);
  });

  it("cache é sempre por conversa: B nunca lê o conteúdo de A", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", { msgs: [{ id: "m1" }] as any, contato: null, notas: [], eventos: [] });
    expect(cache.obter("B")).toBeUndefined();
    expect(cache.obter("A")?.msgs.length).toBe(1);
  });

  it("conversa sem cache abre vazia (skeleton), não com dados da anterior", () => {
    const cache = criarCacheConversas();
    expect(cache.obter("nova")).toBeUndefined();
  });

  it("composer não envia para a conversa anterior durante a troca", () => {
    expect(
      acaoPermitida({
        alvo: "A",
        selecionadaAgora: "A",
        carregando: false,
        selecaoAtual: "B",
      }),
    ).toBe(false);
    expect(
      acaoPermitida({ alvo: "B", selecionadaAgora: "B", carregando: false, selecaoAtual: "B" }),
    ).toBe(true);
  });

  it("rascunhos ficam separados por conversa", () => {
    let mapa = gravarRascunho({}, "A", "texto do lead A");
    mapa = gravarRascunho(mapa, "B", "texto do lead B");
    expect(lerRascunho(mapa, "A")).toBe("texto do lead A");
    expect(lerRascunho(mapa, "B")).toBe("texto do lead B");
    expect(lerRascunho(mapa, "C")).toBe("");
  });

  it("resumo e contato atrasados de outra conversa não são aplicados", () => {
    for (const alvo of ["A", "outro"]) {
      expect(
        respostaAindaVale({ ...base, alvo, selecionadaAgora: "B", selecaoAtual: "B" }),
      ).toBe(false);
    }
  });
});
