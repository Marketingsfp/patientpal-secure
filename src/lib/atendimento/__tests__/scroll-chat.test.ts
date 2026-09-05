import { describe, expect, it } from "bun:test";
import {
  decidirScroll,
  distanciaDoFim,
  pertoDoFim,
  rotuloNovasMensagens,
} from "../scroll-chat";

const noFim = { scrollTop: 900, scrollHeight: 1400, clientHeight: 500 };
const lendoHistorico = { scrollTop: 0, scrollHeight: 4000, clientHeight: 500 };

describe("scroll do chat de atendimento", () => {
  it("mede a distância do fim", () => {
    expect(distanciaDoFim(noFim)).toBe(0);
    expect(distanciaDoFim(lendoHistorico)).toBe(3500);
    expect(pertoDoFim({ scrollTop: 850, scrollHeight: 1400, clientHeight: 500 })).toBe(true);
    expect(pertoDoFim(lendoHistorico)).toBe(false);
  });

  it("abre a conversa sempre no fim, sem animação (testes 1, 2, 3 e 4)", () => {
    for (const total of [5, 200]) {
      expect(
        decidirScroll({
          primeiraCarga: true,
          totalAnterior: 0,
          totalAtual: total,
          ultimoIdAnterior: null,
          ultimoIdAtual: `m-${total}`,
          posicao: lendoHistorico,
          novasAtuais: 0,
        }),
      ).toEqual({ tipo: "ir_ao_fim", suave: false, zerarNovas: true });
    }
  });

  it("não puxa a tela quando a atendente está lendo o histórico (teste 5)", () => {
    const a = decidirScroll({
      primeiraCarga: false,
      totalAnterior: 10,
      totalAtual: 11,
      ultimoIdAnterior: "m-10",
      ultimoIdAtual: "m-11",
      posicao: lendoHistorico,
      novasAtuais: 0,
    });
    expect(a).toEqual({ tipo: "manter", novas: 1 });
    const b = decidirScroll({
      primeiraCarga: false,
      totalAnterior: 11,
      totalAtual: 13,
      ultimoIdAnterior: "m-11",
      ultimoIdAtual: "m-13",
      posicao: lendoHistorico,
      novasAtuais: 1,
    });
    expect(b).toEqual({ tipo: "manter", novas: 3 });
  });

  it("acompanha automaticamente quem já está no fim (teste 6)", () => {
    expect(
      decidirScroll({
        primeiraCarga: false,
        totalAnterior: 10,
        totalAtual: 11,
        ultimoIdAnterior: "m-10",
        ultimoIdAtual: "m-11",
        posicao: noFim,
        novasAtuais: 0,
      }),
    ).toEqual({ tipo: "ir_ao_fim", suave: false, zerarNovas: true });
  });

  it("carregar mensagens antigas mantém a posição (teste 7)", () => {
    expect(
      decidirScroll({
        primeiraCarga: false,
        totalAnterior: 50,
        totalAtual: 100,
        ultimoIdAnterior: "m-50",
        ultimoIdAtual: "m-50",
        posicao: lendoHistorico,
        novasAtuais: 0,
      }),
    ).toEqual({ tipo: "manter", novas: 0 });
  });

  it("evento interno também conta como último item da linha do tempo", () => {
    expect(
      decidirScroll({
        primeiraCarga: false,
        totalAnterior: 10,
        totalAtual: 11,
        ultimoIdAnterior: "m-10",
        ultimoIdAtual: "e-99",
        posicao: noFim,
        novasAtuais: 0,
      }).tipo,
    ).toBe("ir_ao_fim");
  });

  it("rotula o indicador no plural correto", () => {
    expect(rotuloNovasMensagens(1)).toBe("1 nova mensagem");
    expect(rotuloNovasMensagens(3)).toBe("3 novas mensagens");
  });
});

describe("janela de abertura da conversa", () => {
  const base = {
    primeiraCarga: false,
    totalAnterior: 10,
    totalAtual: 12,
    ultimoIdAnterior: "m-10",
    ultimoIdAtual: "e-12",
    posicao: lendoHistorico,
    novasAtuais: 0,
  };

  it("conteúdo que chega logo após abrir (resumo, eventos) mantém a tela no fim", () => {
    expect(decidirScroll({ ...base, emAbertura: true })).toEqual({
      tipo: "ir_ao_fim",
      suave: false,
      zerarNovas: true,
    });
  });

  it("não vira botão de novas mensagens durante a abertura", () => {
    const acao = decidirScroll({ ...base, emAbertura: true });
    expect(acao.tipo).not.toBe("manter");
  });

  it("depois que a atendente rola, volta a respeitar a leitura do histórico", () => {
    expect(decidirScroll({ ...base, emAbertura: false })).toEqual({
      tipo: "manter",
      novas: 2,
    });
  });

  it("carregar mensagens antigas nunca joga para o fim, mesmo na abertura", () => {
    expect(
      decidirScroll({
        ...base,
        emAbertura: true,
        totalAtual: 50,
        ultimoIdAtual: "m-10",
      }),
    ).toEqual({ tipo: "manter", novas: 0 });
  });
});
