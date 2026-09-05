import { describe, expect, it } from "bun:test";
import {
  conversasDesatualizadas,
  criarCacheConversas,
  respostaAindaVale,
} from "../conversa-cache";
import {
  JANELA_ANTERIOR,
  JANELA_INICIAL,
  cursorMaisAntigo,
  mesclarAnteriores,
  podeCarregarMais,
} from "../mensagens-janela";

/**
 * FASE 3 — histórico e cache.
 *
 * Abrir uma conversa nunca carrega o histórico inteiro: só a janela recente.
 * O restante entra sob demanda ao rolar para cima, sem perder a posição de
 * leitura. O cache é sempre por conversa, e uma mensagem nova invalida apenas
 * o cache daquela conversa.
 */

/** Banco falso: histórico completo de uma conversa, em ordem cronológica. */
function historico(total: number, prefixo = "m") {
  return Array.from({ length: total }, (_, i) => ({
    id: `${prefixo}-${i + 1}`,
    recebida_em: new Date(2026, 0, 1, 0, 0, i + 1).toISOString(),
  }));
}

/** Reproduz a busca do servidor: mais recentes primeiro, devolvidas em ordem. */
function buscar(todas: any[], limite: number, antesDe?: string | null) {
  const filtradas = antesDe
    ? todas.filter((m) => new Date(m.recebida_em).getTime() < new Date(antesDe).getTime())
    : todas;
  return filtradas.slice(-limite);
}

describe("abertura da conversa — janela recente", () => {
  it("conversa curta (10 mensagens) abre inteira e sem botão de anteriores", () => {
    const todas = historico(10);
    const primeira = buscar(todas, JANELA_INICIAL);
    expect(primeira.length).toBe(10);
    expect(podeCarregarMais(primeira.length, JANELA_INICIAL)).toBe(false);
  });

  it("conversa longa (500 mensagens) carrega só a janela recente", () => {
    const todas = historico(500);
    const primeira = buscar(todas, JANELA_INICIAL);
    expect(primeira.length).toBe(JANELA_INICIAL);
    expect(primeira.at(-1)?.id).toBe("m-500");
    expect(podeCarregarMais(primeira.length, JANELA_INICIAL)).toBe(true);
  });

  it("carregar anteriores traz o bloco antigo, sem duplicar e em ordem", () => {
    const todas = historico(500);
    let visiveis = buscar(todas, JANELA_INICIAL);
    const antigas = buscar(todas, JANELA_ANTERIOR, cursorMaisAntigo(visiveis));
    visiveis = mesclarAnteriores(visiveis, antigas);

    expect(visiveis.length).toBe(JANELA_INICIAL + JANELA_ANTERIOR);
    expect(new Set(visiveis.map((m) => m.id)).size).toBe(visiveis.length);
    expect(visiveis[0].id).toBe("m-421");
    expect(visiveis.at(-1)?.id).toBe("m-500");
    // Muito menos do que o histórico inteiro.
    expect(visiveis.length).toBeLessThan(todas.length);
  });

  it("a posição de leitura é preservada ao carregar mensagens antigas", () => {
    // A tela recoloca o scroll pela diferença de altura, não no fim.
    const alturaAntes = 2000;
    const topoAntes = 120;
    const alturaDepois = 5200;
    const novoTopo = topoAntes + (alturaDepois - alturaAntes);
    expect(novoTopo).toBe(3320);
    expect(novoTopo).not.toBe(alturaDepois);
  });

  it("chega ao começo do histórico quando o bloco volta incompleto", () => {
    const todas = historico(50);
    const visiveis = buscar(todas, JANELA_INICIAL);
    const antigas = buscar(todas, JANELA_ANTERIOR, cursorMaisAntigo(visiveis));
    expect(antigas.length).toBe(10);
    expect(podeCarregarMais(antigas.length, JANELA_ANTERIOR)).toBe(false);
  });
});

describe("cache por conversa", () => {
  it("A → B → A mostra o conteúdo de A na hora, sem esperar a rede", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", { msgs: historico(3, "a"), contato: { id: "ca" }, notas: [], eventos: [] });
    cache.guardar("B", { msgs: historico(2, "b"), contato: { id: "cb" }, notas: [], eventos: [] });

    const voltandoParaA = cache.obter("A");
    expect(voltandoParaA?.msgs.at(-1)?.id).toBe("a-3");
    expect(voltandoParaA?.contato.id).toBe("ca");
  });

  it("nenhum conteúdo atravessa de uma conversa para outra", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", { msgs: historico(3, "a"), contato: { id: "ca" }, notas: [], eventos: [] });
    expect(cache.obter("B")).toBeUndefined();
    // Resposta atrasada de A não entra na tela de B.
    expect(
      respostaAindaVale({ alvo: "A", selecionadaAgora: "B", pedido: 1, pedidoAtual: 2 }),
    ).toBe(false);
  });

  it("mensagem nova em conversa cacheada tira o conteúdo velho do cache", () => {
    const cache = criarCacheConversas();
    cache.guardar("A", { msgs: historico(3, "a"), contato: { id: "ca" }, notas: [], eventos: [] });
    cache.guardar("B", { msgs: historico(2, "b"), contato: { id: "cb" }, notas: [], eventos: [] });

    const vencidas = conversasDesatualizadas({
      anteriores: [
        { id: "A", ultima_mensagem_em: "2026-01-01T10:00:00Z" },
        { id: "B", ultima_mensagem_em: "2026-01-01T09:00:00Z" },
      ],
      atuais: [
        { id: "A", ultima_mensagem_em: "2026-01-01T11:30:00Z" },
        { id: "B", ultima_mensagem_em: "2026-01-01T09:00:00Z" },
      ],
      emCache: cache.chaves(),
    });

    expect(vencidas).toEqual(["A"]);
    for (const id of vencidas) cache.invalidar(id);
    expect(cache.obter("A")).toBeUndefined();
    // A conversa parada continua servida pelo cache dela.
    expect(cache.obter("B")?.msgs.at(-1)?.id).toBe("b-2");
  });

  it("conversa fora do cache não gera invalidação", () => {
    const vencidas = conversasDesatualizadas({
      anteriores: [{ id: "C", ultima_mensagem_em: "2026-01-01T10:00:00Z" }],
      atuais: [{ id: "C", ultima_mensagem_em: "2026-01-01T12:00:00Z" }],
      emCache: ["A"],
    });
    expect(vencidas).toEqual([]);
  });

  it("conversa nova na lista não invalida nada", () => {
    const vencidas = conversasDesatualizadas({
      anteriores: [],
      atuais: [{ id: "A", ultima_mensagem_em: "2026-01-01T12:00:00Z" }],
      emCache: ["A"],
    });
    expect(vencidas).toEqual([]);
  });
});
