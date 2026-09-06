import { describe, expect, it } from "bun:test";
import { deveRegistrarLeituraAoAbrir } from "../leitura-inbox";

const base = {
  userId: "maria",
  atribuidaUserId: "maria",
  ehGestor: false,
  conversaId: "c1",
  conversaCarregadaId: "c1",
  abaVisivel: true,
  aberturaPorAlvo: false,
  ultimaMensagemId: "m9",
  ultimaRegistradaId: null as string | null,
};

describe("leitura ao abrir a conversa", () => {
  it("registra quando a atendente responsável vê as mensagens", () => {
    expect(deveRegistrarLeituraAoAbrir(base)).toBe(true);
  });

  it("não registra durante o carregamento (skeleton) nem em troca de lead", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, conversaCarregadaId: null })).toBe(false);
    expect(deveRegistrarLeituraAoAbrir({ ...base, conversaCarregadaId: "c2" })).toBe(false);
  });

  it("não registra com a aba em segundo plano", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, abaVisivel: false })).toBe(false);
  });

  it("não registra sem mensagens exibidas (prefetch/cache vazio)", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, ultimaMensagemId: null })).toBe(false);
  });

  it("não registra ao localizar uma mensagem antiga por 'Ver conversa'", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, aberturaPorAlvo: true })).toBe(false);
  });

  it("administrador/supervisor acompanha sem registrar", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, ehGestor: true })).toBe(false);
  });

  it("conversa de outra pessoa não vira leitura minha", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, atribuidaUserId: "jean" })).toBe(false);
    expect(deveRegistrarLeituraAoAbrir({ ...base, atribuidaUserId: null })).toBe(false);
  });

  it("não repete a mesma marcação, mas registra quando chega mensagem nova", () => {
    expect(deveRegistrarLeituraAoAbrir({ ...base, ultimaRegistradaId: "m9" })).toBe(false);
    expect(deveRegistrarLeituraAoAbrir({ ...base, ultimaRegistradaId: "m8" })).toBe(true);
  });
});
