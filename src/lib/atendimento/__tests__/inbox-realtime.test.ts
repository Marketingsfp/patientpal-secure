import { describe, expect, it } from "vitest";
import {
  avisoSaidaEscopo,
  devoAutoSelecionar,
  selecaoSaiuDoEscopo,
} from "../inbox-realtime";
import { filtroEscopoInbox, conversaVisivelNoEscopo } from "../escopo-inbox";

const jean = "11111111-1111-1111-1111-111111111111";
const maria = "22222222-2222-2222-2222-222222222222";

const visivel = (escopo: any, conversa: any, userId = jean, gestor = false) =>
  conversaVisivelNoEscopo(conversa, filtroEscopoInbox({ escopo, userId, gestor }));

describe("FASE 3 — movimentação entre Inboxes", () => {
  it("Jean → Maria: sai de Minhas de Jean e entra em Minhas de Maria", () => {
    const conv = { id: "c1", atribuida_user_id: maria, owner_type: "HUMAN", status: "active" };
    expect(visivel("minhas", conv, jean)).toBe(false);
    expect(visivel("minhas", conv, maria)).toBe(true);
  });

  it("Maria → Jean: caminho inverso", () => {
    const conv = { id: "c1", atribuida_user_id: jean, owner_type: "HUMAN", status: "active" };
    expect(visivel("minhas", conv, maria)).toBe(false);
    expect(visivel("minhas", conv, jean)).toBe(true);
  });

  it("Nina → Jean: sai do filtro Nina e entra em Minhas de Jean", () => {
    const antes = { id: "c1", atribuida_user_id: null, owner_type: "AI", status: "active" };
    const depois = { id: "c1", atribuida_user_id: jean, owner_type: "HUMAN", status: "active" };
    expect(visivel("nina", antes)).toBe(true);
    expect(visivel("nina", depois)).toBe(false);
    expect(visivel("minhas", depois, jean)).toBe(true);
  });

  it("Nina/humano → Não atribuídas quando o responsável é removido", () => {
    const conv = { id: "c1", atribuida_user_id: null, owner_type: "NONE", status: "waiting" };
    expect(visivel("minhas", conv, jean)).toBe(false);
    expect(visivel("nao_atribuidas", conv, jean)).toBe(true);
  });

  it("resolver: sai das ativas e aparece em Fechadas", () => {
    const conv = { id: "c1", atribuida_user_id: jean, owner_type: "HUMAN", status: "closed" };
    expect(visivel("minhas", conv, jean)).toBe(false);
    expect(visivel("fechadas", conv, jean)).toBe(true);
  });

  it("reabertura: sai de Fechadas e volta para a Nina, não para o último humano", () => {
    const conv = { id: "c1", atribuida_user_id: null, owner_type: "AI", status: "active" };
    expect(visivel("fechadas", conv, jean)).toBe(false);
    expect(visivel("minhas", conv, jean)).toBe(false);
    expect(visivel("nina", conv, jean)).toBe(true);
  });

  it("conversa aberta que saiu da lista é retirada da tela", () => {
    expect(selecaoSaiuDoEscopo("c1", [{ id: "c2" }, { id: "c3" }])).toBe(true);
    expect(selecaoSaiuDoEscopo("c1", [{ id: "c1" }])).toBe(false);
    expect(selecaoSaiuDoEscopo(null, [])).toBe(false);
  });

  it("cada filtro tem seu próprio aviso e nada é escolhido sozinho depois da saída", () => {
    expect(avisoSaidaEscopo("minhas")).toMatch(/não está mais com você/i);
    expect(avisoSaidaEscopo("nina")).toMatch(/Nina/);
    expect(avisoSaidaEscopo("nao_atribuidas")).toMatch(/responsável/i);
    expect(avisoSaidaEscopo("fechadas")).toMatch(/reaberta/i);
    expect(
      devoAutoSelecionar({ temSelecao: false, removeuAgora: true, primeiraLinha: { id: "c2" } }),
    ).toBe(false);
    expect(
      devoAutoSelecionar({ temSelecao: false, removeuAgora: false, primeiraLinha: { id: "c2" } }),
    ).toBe(true);
    expect(
      devoAutoSelecionar({ temSelecao: true, removeuAgora: false, primeiraLinha: { id: "c2" } }),
    ).toBe(false);
  });
});
