import { describe, expect, it } from "bun:test";
import { avaliarLeituraAutomatica, deveRegistrarLeituraVisivel } from "../leitura-inbox";
import { classificarEvento } from "../realtime-roteador";
import { patchListaPorMensagem } from "../patch-inbox";

const base = {
  userId: "telefonia",
  atribuidaUserId: null,
  ehGestor: false,
  acessoPermitido: true,
  conversaId: "c1",
  conversaCarregadaId: "c1",
  abaVisivel: true,
  aberturaPorAlvo: false,
  ultimaMensagemId: "m2",
  ultimaRegistradaId: null as string | null,
  seguindoFim: true,
};

describe("leitura operacional compartilhada", () => {
  it("perfil operacional com acesso verificado pode ler Nina ou histórico próprio", () => {
    expect(avaliarLeituraAutomatica(base).pode).toBe(true);
    expect(deveRegistrarLeituraVisivel(base)).toBe(true);
    expect(deveRegistrarLeituraVisivel({ ...base, acessoPermitido: false })).toBe(false);
  });

  it("supervisão não consome mensagens mesmo com acesso autorizado e atribuição própria", () => {
    expect(
      deveRegistrarLeituraVisivel({ ...base, ehGestor: true, atribuidaUserId: base.userId }),
    ).toBe(false);
  });

  it("novas mensagens enquanto lê histórico ou com aba oculta continuam pendentes", () => {
    expect(
      deveRegistrarLeituraVisivel({ ...base, ultimaRegistradaId: "m1", seguindoFim: false }),
    ).toBe(false);
    expect(deveRegistrarLeituraVisivel({ ...base, abaVisivel: false })).toBe(false);
    expect(deveRegistrarLeituraVisivel({ ...base, ultimaRegistradaId: "m1" })).toBe(true);
  });

  it("abertura por mensagem antiga nunca cai no caminho alternativo de novas mensagens", () => {
    expect(deveRegistrarLeituraVisivel({ ...base, aberturaPorAlvo: true })).toBe(false);
    expect(deveRegistrarLeituraVisivel({ ...base, ultimaRegistradaId: "m2" })).toBe(false);
  });

  it("supervisor com conversa aberta vê o contador subir até uma leitura operacional confirmada", () => {
    const result = patchListaPorMensagem(
      [{ id: "c1", nao_lidas: 238 }],
      {
        conversa_id: "c1",
        direction: "in",
        recebida_em: "2026-09-17T12:00:00Z",
        body: "Olá",
      },
      { conversaAberta: "c1" },
    );
    expect(result.lista[0].nao_lidas).toBe(239);
  });

  it("leitura de outra sessão atualiza apenas a lista da mesma clínica", () => {
    const event = {
      table: "atend_leitura_operacional",
      eventType: "UPDATE",
      new: { conversa_id: "c1", clinica_id: "cl1" },
    };
    expect(classificarEvento(event, { clinicaId: "cl1", conversaAberta: "c1" })).toEqual(["lista"]);
    expect(classificarEvento(event, { clinicaId: "cl2", conversaAberta: "c1" })).toEqual([]);
  });
});
