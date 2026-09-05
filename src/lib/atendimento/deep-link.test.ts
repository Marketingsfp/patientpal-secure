import { describe, expect, it } from "vitest";
import { devoAutoSelecionarComUrl, escopoParaConversa } from "./deep-link";

const JEAN = "11111111-1111-1111-1111-111111111111";
const MARIA = "22222222-2222-2222-2222-222222222222";

describe("deep link da conversa", () => {
  it("não escolhe outra conversa quando o endereço já aponta uma (F5/link colado)", () => {
    expect(
      devoAutoSelecionarComUrl({
        conversaIdUrl: "abc",
        temSelecao: false,
        removeuAgora: false,
        temPrimeiraLinha: true,
      }),
    ).toBe(false);
  });

  it("sem conversa no endereço, mantém a seleção automática antiga", () => {
    expect(
      devoAutoSelecionarComUrl({
        conversaIdUrl: null,
        temSelecao: false,
        removeuAgora: false,
        temPrimeiraLinha: true,
      }),
    ).toBe(true);
    expect(
      devoAutoSelecionarComUrl({
        conversaIdUrl: null,
        temSelecao: true,
        removeuAgora: false,
        temPrimeiraLinha: true,
      }),
    ).toBe(false);
  });

  it("mantém o filtro atual quando a conversa do link já cabe nele", () => {
    const conversa = { atribuida_user_id: JEAN, owner_type: "HUMAN", status: "active" };
    expect(escopoParaConversa(conversa, { escopoAtual: "minhas", userId: JEAN, gestor: false })).toBe(
      "minhas",
    );
  });

  it("troca para Nina quando o link aponta conversa da Nina", () => {
    const conversa = { atribuida_user_id: null, owner_type: "AI", status: "bot_attending" };
    expect(escopoParaConversa(conversa, { escopoAtual: "minhas", userId: JEAN, gestor: false })).toBe(
      "nina",
    );
  });

  it("conversa resolvida do próprio atendente abre em Fechadas", () => {
    const conversa = { atribuida_user_id: JEAN, owner_type: "HUMAN", status: "closed" };
    expect(escopoParaConversa(conversa, { escopoAtual: "minhas", userId: JEAN, gestor: false })).toBe(
      "fechadas",
    );
  });

  it("gestor abre conversa de outro atendente pelo filtro Equipe", () => {
    const conversa = { atribuida_user_id: MARIA, owner_type: "HUMAN", status: "active" };
    expect(escopoParaConversa(conversa, { escopoAtual: "minhas", userId: JEAN, gestor: true })).toBe(
      "equipe",
    );
  });

  it("atendente comum não ganha acesso implícito a conversa de outro", () => {
    const conversa = { atribuida_user_id: MARIA, owner_type: "HUMAN", status: "active" };
    expect(escopoParaConversa(conversa, { escopoAtual: "minhas", userId: JEAN, gestor: false })).toBe(
      null,
    );
  });

  it("conversa reaberta com a Nina volta a aparecer em Nina, mesma URL", () => {
    const conversa = { atribuida_user_id: null, owner_type: "AI", status: "bot_attending" };
    expect(escopoParaConversa(conversa, { escopoAtual: "fechadas", userId: JEAN, gestor: false })).toBe(
      "nina",
    );
  });
});
