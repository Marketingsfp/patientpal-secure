import { describe, expect, it } from "bun:test";
import {
  aplicarReconciliacao,
  deveRegistrarLeituraDeNovas,
} from "../leitura-inbox";

const base = {
  userId: "u-maria",
  atribuidaUserId: "u-maria",
  ehGestor: false,
  conversaId: "c1",
  conversaCarregadaId: "c1",
  abaVisivel: true,
  seguindoFim: true,
  ultimaMensagemId: "m101",
  ultimaRegistradaId: "m100",
};

describe("leitura com mensagens novas (Fase 4)", () => {
  it("marca a mensagem nova quando a atendente acompanha o fim", () => {
    expect(deveRegistrarLeituraDeNovas(base)).toBe(true);
  });

  it("não marca quando a atendente subiu para ler o histórico", () => {
    expect(deveRegistrarLeituraDeNovas({ ...base, seguindoFim: false })).toBe(false);
  });

  it("não marca com a aba em segundo plano", () => {
    expect(deveRegistrarLeituraDeNovas({ ...base, abaVisivel: false })).toBe(false);
  });

  it("não marca em conversa diferente da carregada (troca de lead)", () => {
    expect(deveRegistrarLeituraDeNovas({ ...base, conversaCarregadaId: "c2" })).toBe(false);
  });

  it("administrador acompanhando o fim não altera a leitura da atendente", () => {
    expect(deveRegistrarLeituraDeNovas({ ...base, ehGestor: true })).toBe(false);
  });

  it("não repete requisição quando o marcador já está na mesma mensagem", () => {
    expect(deveRegistrarLeituraDeNovas({ ...base, ultimaRegistradaId: "m101" })).toBe(false);
  });

  it("volta ao fim depois do histórico avança o marcador", () => {
    const lendoHistorico = deveRegistrarLeituraDeNovas({ ...base, seguindoFim: false });
    const voltouAoFim = deveRegistrarLeituraDeNovas({ ...base, seguindoFim: true });
    expect([lendoHistorico, voltouAoFim]).toEqual([false, true]);
  });
});

describe("reconciliação do contador", () => {
  it("usa o número do backend (mensagem que chegou durante a gravação continua não lida)", () => {
    expect(
      aplicarReconciliacao({
        sequenciaResposta: 3,
        sequenciaAtual: 3,
        naoLidasBackend: 1,
        naoLidasAnterior: 4,
      }),
    ).toEqual({ aplicar: true, valor: 1 });
  });

  it("resposta atrasada não sobrescreve o estado mais recente", () => {
    expect(
      aplicarReconciliacao({
        sequenciaResposta: 2,
        sequenciaAtual: 5,
        naoLidasBackend: 0,
        naoLidasAnterior: 4,
      }).aplicar,
    ).toBe(false);
  });

  it("evento duplicado com o mesmo resultado não corrompe a contagem", () => {
    const a = aplicarReconciliacao({
      sequenciaResposta: 7,
      sequenciaAtual: 7,
      naoLidasBackend: 0,
      naoLidasAnterior: 2,
    });
    const b = aplicarReconciliacao({
      sequenciaResposta: 7,
      sequenciaAtual: 7,
      naoLidasBackend: 0,
      naoLidasAnterior: 2,
    });
    expect(a).toEqual(b);
    expect(a.valor).toBe(0);
  });

  it("resposta sem número válido preserva o valor anterior", () => {
    expect(
      aplicarReconciliacao({
        sequenciaResposta: 1,
        sequenciaAtual: 1,
        naoLidasBackend: undefined,
        naoLidasAnterior: 3,
      }),
    ).toEqual({ aplicar: true, valor: 3 });
  });
});
