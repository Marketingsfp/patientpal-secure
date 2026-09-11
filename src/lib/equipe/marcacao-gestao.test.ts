import { describe, expect, it } from "bun:test";
import {
  filtrarMembros,
  ordenarMembros,
  podeReceberMarcacaoGestao,
  ROLES_ELEGIVEIS_GESTAO,
  rotuloRole,
  type MembroEquipe,
} from "./marcacao-gestao";

function membro(nome: string, role: string, podeAutorizar = false, ativo = true): MembroEquipe {
  return {
    membershipId: `m-${nome}`,
    userId: `u-${nome}`,
    nome,
    role,
    ativo,
    podeAutorizar,
    podeGerirHorarios: false,
  };
}

describe("ROLES_ELEGIVEIS_GESTAO", () => {
  it("cobre todos os perfis que alguma alçada aceita", () => {
    expect(ROLES_ELEGIVEIS_GESTAO).toEqual(["admin", "financeiro", "gestor", "supervisor"]);
  });

  it("não oferece a marcação para quem ela não habilitaria nada", () => {
    expect(podeReceberMarcacaoGestao("recepcao")).toBe(false);
    expect(podeReceberMarcacaoGestao("caixa")).toBe(false);
    expect(podeReceberMarcacaoGestao("medico")).toBe(false);
    expect(podeReceberMarcacaoGestao("telefonia")).toBe(false);
    expect(podeReceberMarcacaoGestao(null)).toBe(false);
  });

  it("oferece para os perfis de gestão", () => {
    expect(podeReceberMarcacaoGestao("admin")).toBe(true);
    expect(podeReceberMarcacaoGestao("gestor")).toBe(true);
    expect(podeReceberMarcacaoGestao("supervisor")).toBe(true);
    expect(podeReceberMarcacaoGestao("financeiro")).toBe(true);
  });
});

describe("rotuloRole", () => {
  it("traduz o perfil para o português do balcão", () => {
    expect(rotuloRole("recepcao")).toBe("Recepção");
    expect(rotuloRole("admin")).toBe("Administrador");
  });

  it("perfil desconhecido aparece como veio, e vazio vira travessão", () => {
    expect(rotuloRole("perfil_novo")).toBe("perfil_novo");
    expect(rotuloRole("")).toBe("—");
    expect(rotuloRole(null)).toBe("—");
  });
});

describe("ordenarMembros", () => {
  it("quem já é gestão aparece primeiro", () => {
    const lista = ordenarMembros([
      membro("AMANDA", "recepcao"),
      membro("TANIA", "admin", true),
      membro("BRUNA", "caixa"),
    ]);
    expect(lista.map((m) => m.nome)).toEqual(["TANIA", "AMANDA", "BRUNA"]);
  });

  it("inativo desce, mesmo com nome anterior no alfabeto", () => {
    const lista = ordenarMembros([
      membro("ANA", "recepcao", false, false),
      membro("ZILDA", "recepcao", false, true),
    ]);
    expect(lista.map((m) => m.nome)).toEqual(["ZILDA", "ANA"]);
  });

  it("empate resolve pelo nome, sem depender de acento", () => {
    const lista = ordenarMembros([membro("ZILDA", "caixa"), membro("ÂNGELA", "caixa")]);
    expect(lista.map((m) => m.nome)).toEqual(["ÂNGELA", "ZILDA"]);
  });

  it("não altera a lista recebida", () => {
    const original = [membro("ZILDA", "caixa"), membro("ANA", "admin", true)];
    const copia = [...original];
    ordenarMembros(original);
    expect(original).toEqual(copia);
  });
});

describe("filtrarMembros", () => {
  const lista = [
    membro("TANIA MARIA DE OLIVEIRA", "admin", true),
    membro("AMANDA FELICIA", "recepcao"),
    membro("LUAN CARLOS", "gestor", true),
  ];

  it("busca vazia devolve todo mundo", () => {
    expect(filtrarMembros(lista, "").length).toBe(3);
    expect(filtrarMembros(lista, "   ").length).toBe(3);
  });

  it("acha por parte do nome, ignorando acento e caixa", () => {
    expect(filtrarMembros(lista, "tânia").map((m) => m.nome)).toEqual(["TANIA MARIA DE OLIVEIRA"]);
    expect(filtrarMembros(lista, "amanda").length).toBe(1);
  });

  it("acha pelo perfil escrito em português", () => {
    expect(filtrarMembros(lista, "recepção").map((m) => m.nome)).toEqual(["AMANDA FELICIA"]);
  });

  it("termo sem resultado devolve lista vazia", () => {
    expect(filtrarMembros(lista, "zzz")).toEqual([]);
  });
});
