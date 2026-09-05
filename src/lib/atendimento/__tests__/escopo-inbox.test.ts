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

/* ===== FASE 2 — filtros operacionais ===== */

const fase2 = [
  { id: "j-aberta", atribuida_user_id: jean, owner_type: "HUMAN", status: "active", nome: "Ana" },
  {
    id: "j-maria",
    atribuida_user_id: jean,
    owner_type: "HUMAN",
    status: "active",
    nome: "Maria Silva",
  },
  {
    id: "nina-maria",
    atribuida_user_id: null,
    owner_type: "AI",
    status: "bot_attending",
    nome: "Maria Silva",
  },
  { id: "sem", atribuida_user_id: null, owner_type: "NONE", status: "waiting", nome: "Bruno" },
  { id: "j-fechada", atribuida_user_id: jean, owner_type: "HUMAN", status: "closed", nome: "Ana" },
  {
    id: "m-fechada",
    atribuida_user_id: maria,
    owner_type: "HUMAN",
    status: "finished",
    nome: "Carla",
  },
];

function lista(escopo: any, userId = jean, gestor = false) {
  return fase2
    .filter((c) => conversaVisivelNoEscopo(c, { escopo, userId, gestor }))
    .map((c) => c.id);
}

function buscar(termo: string, escopo: any, userId = jean, gestor = false) {
  return fase2
    .filter((c) => conversaVisivelNoEscopo(c, { escopo, userId, gestor }))
    .filter((c) => c.nome.toLowerCase().includes(termo.toLowerCase()))
    .map((c) => c.id);
}

describe("filtros operacionais da Inbox", () => {
  it("Minhas mostra somente as do usuário e sem as encerradas", () => {
    expect(lista("minhas")).toEqual(["j-aberta", "j-maria"]);
  });

  it("Nina mostra somente conversas sob a IA", () => {
    expect(lista("nina")).toEqual(["nina-maria"]);
  });

  it("Não atribuídas mostra somente sem responsável", () => {
    expect(lista("nao_atribuidas")).toEqual(["sem"]);
  });

  it("Fechadas mostra as encerradas do próprio atendente", () => {
    expect(lista("fechadas")).toEqual(["j-fechada"]);
  });

  it("Fechadas do gestor inclui o histórico da clínica", () => {
    expect(lista("fechadas", jean, true)).toEqual(["j-fechada", "m-fechada"]);
  });

  it("busca respeita o filtro selecionado", () => {
    expect(buscar("Maria Silva", "minhas")).toEqual(["j-maria"]);
    expect(buscar("Maria Silva", "nina")).toEqual(["nina-maria"]);
  });

  it("ordenação acontece depois do filtro de propriedade", () => {
    const doJean = fase2.filter((c) =>
      conversaVisivelNoEscopo(c, { escopo: "minhas", userId: jean, gestor: false }),
    );
    const ordenado = [...doJean].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => c.id);
    expect(ordenado).toEqual(["j-aberta", "j-maria"]);
    expect(ordenado).not.toContain("nina-maria");
  });

  it("contadores de cada filtro são independentes", () => {
    expect({
      minhas: lista("minhas").length,
      nina: lista("nina").length,
      nao_atribuidas: lista("nao_atribuidas").length,
      fechadas: lista("fechadas").length,
    }).toEqual({ minhas: 2, nina: 1, nao_atribuidas: 1, fechadas: 1 });
  });
});
