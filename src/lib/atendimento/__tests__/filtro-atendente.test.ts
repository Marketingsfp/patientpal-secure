/**
 * FASE 1 — Filtro de conversas por atendente (supervisão).
 *
 * Só visualização: o filtro nunca muda responsável, status ou leitura, e
 * nunca amplia o que a pessoa já podia ver.
 */
import { describe, expect, it } from "bun:test";
import { atendenteFiltroEfetivo, conversaDoAtendente } from "@/lib/atendimento/escopo-inbox";
import { chaveInbox, filtrarPorEscopo, podeEntrarNaLista } from "@/lib/atendimento/inbox-cache";
import { patchListaPorConversa } from "@/lib/atendimento/patch-inbox";

const JEAN = "11111111-1111-1111-1111-111111111111";
const MARIA = "22222222-2222-2222-2222-222222222222";

describe("permissão", () => {
  it("sem permissão de supervisão o filtro é ignorado", () => {
    expect(atendenteFiltroEfetivo(JEAN, false)).toBeNull();
  });

  it("com permissão o filtro usa o user_id", () => {
    expect(atendenteFiltroEfetivo(JEAN, true)).toBe(JEAN);
  });

  it("'todos os atendentes' remove a condição", () => {
    expect(atendenteFiltroEfetivo(null, true)).toBeNull();
    expect(atendenteFiltroEfetivo("  ", true)).toBeNull();
  });
});

describe("filtragem da lista", () => {
  const linhas = [
    { id: "c1", atribuida_user_id: JEAN, status: "active" },
    { id: "c2", atribuida_user_id: MARIA, status: "active" },
    { id: "c3", atribuida_user_id: null, owner_type: "AI", status: "active" },
  ];

  it("supervisor vendo Jean recebe só as conversas de Jean", () => {
    const r = filtrarPorEscopo(linhas, {
      escopo: "equipe",
      userId: MARIA,
      gestor: true,
      atendenteId: JEAN,
    });
    expect(r.map((l) => l.id)).toEqual(["c1"]);
  });

  it("'todos os atendentes' mantém a lista da equipe", () => {
    const r = filtrarPorEscopo(linhas, {
      escopo: "equipe",
      userId: MARIA,
      gestor: true,
      atendenteId: null,
    });
    expect(r).toHaveLength(3);
  });

  it("atendente comum não ganha acesso às conversas de outro", () => {
    const r = filtrarPorEscopo(linhas, {
      escopo: "minhas",
      userId: MARIA,
      gestor: false,
      atendenteId: JEAN,
    });
    expect(r.map((l) => l.id)).toEqual(["c2"]);
  });

  it("cada atendente selecionado tem a sua própria caixa de dados", () => {
    const base = { clinicaId: "cl", userId: MARIA, escopo: "equipe" as const };
    expect(chaveInbox({ ...base, atendenteId: JEAN })).not.toBe(
      chaveInbox({ ...base, atendenteId: MARIA }),
    );
    expect(chaveInbox({ ...base, atendenteId: null })).toBe(chaveInbox(base));
  });
});

describe("tempo real", () => {
  it("conversa de outro atendente não entra na lista filtrada", () => {
    const ctx = { escopo: "equipe" as const, userId: MARIA, gestor: true, atendenteId: JEAN };
    expect(podeEntrarNaLista({ id: "c2", atribuida_user_id: MARIA }, ctx)).toBe(false);
    expect(podeEntrarNaLista({ id: "c1", atribuida_user_id: JEAN }, ctx)).toBe(true);
  });

  it("atualização de conversa fora do filtro pede reconciliação, não some com a lista", () => {
    const lista = [{ id: "c1", atribuida_user_id: JEAN, ultima_msg_em: "2026-01-01T00:00:00Z" }];
    const r = patchListaPorConversa(
      lista as any,
      { id: "c1", atribuida_user_id: MARIA },
      { escopo: "equipe", userId: MARIA, gestor: true, atendenteId: JEAN },
    );
    expect(r.aplicado).toBe(false);
    expect(r.reconciliar).toBe(true);
    expect(r.lista).toHaveLength(1);
  });
});

describe("nada de atribuição muda", () => {
  it("o filtro apenas compara o responsável atual", () => {
    const conversa = { atribuida_user_id: JEAN };
    expect(conversaDoAtendente(conversa, JEAN)).toBe(true);
    expect(conversaDoAtendente(conversa, MARIA)).toBe(false);
    // A conversa continua exatamente como estava.
    expect(conversa).toEqual({ atribuida_user_id: JEAN });
  });
});
