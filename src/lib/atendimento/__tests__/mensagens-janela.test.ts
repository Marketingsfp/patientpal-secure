import { describe, it, expect } from "bun:test";
import {
  JANELA_INICIAL,
  JANELA_ANTERIOR,
  mesclarAnteriores,
  podeCarregarMais,
  cursorMaisAntigo,
} from "../mensagens-janela";
import { calcularEtapas, criarMedidorConversa } from "../perf-conversa";

const msg = (id: string, iso: string) => ({ id, recebida_em: iso, body: id });

describe("janela de mensagens", () => {
  it("abre a conversa com uma janela curta", () => {
    expect(JANELA_INICIAL).toBeLessThanOrEqual(50);
    expect(JANELA_INICIAL).toBeGreaterThanOrEqual(30);
  });

  it("junta antigas antes das atuais, em ordem e sem duplicar", () => {
    const atuais = [msg("c", "2026-01-03T10:00:00Z"), msg("d", "2026-01-04T10:00:00Z")];
    const antigas = [
      msg("a", "2026-01-01T10:00:00Z"),
      msg("b", "2026-01-02T10:00:00Z"),
      msg("c", "2026-01-03T10:00:00Z"),
    ];
    const r = mesclarAnteriores(atuais, antigas);
    expect(r.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("indica que ainda há histórico quando a busca voltou cheia", () => {
    expect(podeCarregarMais(JANELA_ANTERIOR, JANELA_ANTERIOR)).toBe(true);
    expect(podeCarregarMais(3, JANELA_ANTERIOR)).toBe(false);
  });

  it("usa a mensagem mais antiga como cursor", () => {
    expect(
      cursorMaisAntigo([msg("b", "2026-01-02T10:00:00Z"), msg("a", "2026-01-01T10:00:00Z")]),
    ).toBe("2026-01-01T10:00:00Z");
    expect(cursorMaisAntigo([])).toBeNull();
  });

  it("conversa longa: primeira exibição não traz o histórico inteiro", () => {
    const todas = Array.from({ length: 220 }, (_, i) =>
      msg(`m${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
    );
    const primeiras = todas.slice(-JANELA_INICIAL);
    expect(primeiras.length).toBe(JANELA_INICIAL);
    expect(primeiras[primeiras.length - 1].id).toBe("m219");
  });
});

describe("medição de abertura", () => {
  it("calcula as etapas entre clique e scroll", () => {
    const r = calcularEtapas({ click: 0, request: 10, dados: 60, render: 80, scroll: 90 });
    expect(r).toEqual({
      click_ate_request: 10,
      request_ate_dados: 50,
      dados_ate_render: 20,
      render_ate_scroll: 10,
      total: 90,
    });
  });

  it("fica desligada por padrão", () => {
    const m = criarMedidorConversa("x", false);
    m.marcar("click");
    expect(m.ativo()).toBe(false);
    expect(m.resumo()).toEqual({});
  });
});
