import { describe, expect, it } from "bun:test";
import {
  ESCOPO_INBOX_PADRAO,
  conversaVisivelNoEscopo,
  escopoEfetivo,
  filtroEscopoInbox,
} from "../escopo-inbox";

const jean = "user-jean";
const maria = "user-maria";
const rodrigo = "user-rodrigo";

const conversas = [
  { id: "j1", atribuida_user_id: jean, owner_type: "HUMAN" },
  { id: "j2", atribuida_user_id: jean, owner_type: "HUMAN" },
  { id: "m1", atribuida_user_id: maria, owner_type: "HUMAN" },
  { id: "r1", atribuida_user_id: rodrigo, owner_type: "HUMAN" },
  { id: "nina1", atribuida_user_id: null, owner_type: "AI" },
  { id: "sem1", atribuida_user_id: null, owner_type: "NONE" },
];

function visiveis(userId: string, escopo = ESCOPO_INBOX_PADRAO, gestor = false) {
  return conversas
    .filter((c) => conversaVisivelNoEscopo(c, { escopo, userId, gestor }))
    .map((c) => c.id);
}

describe("escopo da Inbox", () => {
  it("padrão é Minhas conversas", () => {
    expect(ESCOPO_INBOX_PADRAO).toBe("minhas");
  });

  it("Jean vê somente as conversas atribuídas a ele", () => {
    expect(visiveis(jean)).toEqual(["j1", "j2"]);
  });

  it("Maria vê somente as dela", () => {
    expect(visiveis(maria)).toEqual(["m1"]);
  });

  it("conversa de Rodrigo não aparece para Jean", () => {
    expect(visiveis(jean)).not.toContain("r1");
  });

  it("conversa da Nina não aparece em Minhas conversas", () => {
    expect(visiveis(jean)).not.toContain("nina1");
  });

  it("conversa não atribuída não aparece em Minhas conversas", () => {
    expect(visiveis(jean)).not.toContain("sem1");
  });

  it("contador corresponde apenas às conversas do usuário", () => {
    expect(visiveis(jean).length).toBe(2);
    expect(visiveis(maria).length).toBe(1);
  });

  it("histórico anterior não conta: vale o responsável atual", () => {
    const conv = { atribuida_user_id: maria, owner_type: "HUMAN" };
    expect(conversaVisivelNoEscopo(conv, { escopo: "minhas", userId: jean, gestor: false })).toBe(
      false,
    );
  });

  it("filtro Não atribuídas mostra só quem espera humano, sem as da Nina", () => {
    expect(visiveis(jean, "nao_atribuidas")).toEqual(["sem1"]);
  });

  it("filtro Nina mostra só as conversas da Nina", () => {
    expect(visiveis(jean, "nina")).toEqual(["nina1"]);
  });

  it("atendente comum não consegue ver todas: cai para Minhas conversas", () => {
    expect(escopoEfetivo("todas", false)).toBe("minhas");
    expect(visiveis(jean, "todas", false)).toEqual(["j1", "j2"]);
  });

  it("gestor pode ver todas as conversas da clínica", () => {
    expect(visiveis(jean, "todas", true).length).toBe(conversas.length);
  });

  it("descreve o filtro aplicado no banco", () => {
    expect(filtroEscopoInbox({ escopo: "minhas", userId: jean, gestor: false })).toEqual({
      tipo: "atribuida",
      userId: jean,
    });
    expect(filtroEscopoInbox({ escopo: "nao_atribuidas", userId: jean, gestor: false })).toEqual({
      tipo: "sem_responsavel",
    });
    expect(filtroEscopoInbox({ escopo: "nina", userId: jean, gestor: false })).toEqual({
      tipo: "nina",
    });
    expect(filtroEscopoInbox({ escopo: "todas", userId: jean, gestor: true })).toEqual({
      tipo: "todas",
    });
  });
});
