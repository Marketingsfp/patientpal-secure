/**
 * FASE 3 — a lista acompanha o filtro por atendente em tempo real.
 *
 * Transferência para o atendente escolhido faz a conversa aparecer; saída
 * dele (ou encerramento com "Ativas" selecionado) faz sair. Nada disso muda
 * atribuição, status ou leitura: é só o que a tela mostra.
 */
import { describe, expect, it } from "bun:test";
import { patchListaPorConversa } from "../patch-inbox";

const JEAN = "11111111-1111-4111-8111-111111111111";
const MARIA = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";

const ctx = (extra: Record<string, unknown> = {}) => ({
  escopo: "equipe" as const,
  userId: ADMIN,
  gestor: true,
  atendenteId: JEAN,
  ...extra,
});

const conversa = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  atribuida_user_id: JEAN,
  owner_type: "HUMAN",
  status: "active",
  ultima_msg_em: "2026-01-01T10:00:00.000Z",
  ...over,
});

describe("FASE 3 — realtime do filtro por atendente", () => {
  it("cenário 1: conversa transferida para Jean entra na lista sem recarregar", () => {
    const r = patchListaPorConversa([], conversa(), ctx());
    expect(r.aplicado).toBe(true);
    expect(r.reconciliar).toBe(false);
    expect(r.lista.map((c) => c.id)).toEqual(["c1"]);
  });

  it("cenário 2: conversa transferida para Maria sai da lista de Jean", () => {
    const r = patchListaPorConversa(
      [conversa()],
      conversa({ atribuida_user_id: MARIA }),
      ctx(),
    );
    expect(r.aplicado).toBe(true);
    expect(r.reconciliar).toBe(false);
    expect(r.lista).toEqual([]);
  });

  it("cenário 2b: a mesma conversa entra na lista de quem filtra por Maria", () => {
    const r = patchListaPorConversa(
      [],
      conversa({ atribuida_user_id: MARIA }),
      ctx({ atendenteId: MARIA }),
    );
    expect(r.lista.map((c) => c.id)).toEqual(["c1"]);
  });

  it("cenário 3: handoff da Nina atribuído a Jean aparece na hora", () => {
    const r = patchListaPorConversa(
      [],
      conversa({ owner_type: "HUMAN", atribuida_user_id: JEAN, status: "waiting" }),
      ctx({ status: "all" }),
    );
    expect(r.lista.map((c) => c.id)).toEqual(["c1"]);
  });

  it("cenário 4: Jean + Ativas — conversa resolvida sai da lista", () => {
    const r = patchListaPorConversa(
      [conversa()],
      conversa({ status: "closed" }),
      ctx({ status: "active" }),
    );
    expect(r.lista).toEqual([]);
    expect(r.reconciliar).toBe(false);
  });

  it("cenário 4b: Jean + Fechadas — a conversa encerrada aparece", () => {
    const r = patchListaPorConversa(
      [],
      conversa({ status: "closed" }),
      ctx({ escopo: "fechadas", status: "closed" }),
    );
    expect(r.lista.map((c) => c.id)).toEqual(["c1"]);
  });

  it("atendente comum não recebe conversa de terceiro pelo tempo real", () => {
    const r = patchListaPorConversa(
      [],
      conversa({ atribuida_user_id: JEAN }),
      { escopo: "minhas", userId: MARIA, gestor: false, atendenteId: JEAN },
    );
    expect(r.lista).toEqual([]);
    expect(r.reconciliar).toBe(true);
  });

  it("com busca ativa a lista é conferida no servidor, não montada na tela", () => {
    const r = patchListaPorConversa([], conversa(), ctx({ buscando: true }));
    expect(r.reconciliar).toBe(true);
    expect(r.lista).toEqual([]);
  });

  it("conversa de teste não entra na lista de produção", () => {
    const r = patchListaPorConversa([], conversa({ is_teste: true }), ctx());
    expect(r.lista).toEqual([]);
  });

  it("ordem por última mensagem é mantida ao inserir", () => {
    const antiga = conversa({ id: "c0", ultima_msg_em: "2026-01-01T09:00:00.000Z" });
    const r = patchListaPorConversa([antiga], conversa(), ctx());
    expect(r.lista.map((c) => c.id)).toEqual(["c1", "c0"]);
  });

  it("'Todos os atendentes' volta ao escopo normal", () => {
    const r = patchListaPorConversa(
      [conversa()],
      conversa({ atribuida_user_id: MARIA }),
      ctx({ atendenteId: null }),
    );
    expect(r.lista.map((c) => c.id)).toEqual(["c1"]);
  });
});
