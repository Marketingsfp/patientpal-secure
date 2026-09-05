import { describe, it, expect } from "bun:test";
import {
  ajustarContadorAtual,
  chaveInbox,
  filtrarPorEscopo,
  idsQueSairam,
  moverContador,
  podeEntrarNaLista,
  selecaoDeveSair,
  type ContadoresInbox,
} from "../inbox-cache";

const JEAN = "jean-1";
const MARIA = "maria-2";
const ctxJean = { escopo: "minhas" as const, userId: JEAN, gestor: false };

const conv = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  atribuida_user_id: JEAN,
  owner_type: "HUMAN",
  status: "active",
  ...over,
});

describe("FASE 4 — cache e realtime da Inbox individual", () => {
  it("cache após transferência: conversa de Maria sai da lista de Jean", () => {
    const antes = [conv()];
    const depois = filtrarPorEscopo([conv({ atribuida_user_id: MARIA })], ctxJean);
    expect(depois).toHaveLength(0);
    expect(idsQueSairam(antes, depois)).toEqual(["c1"]);
  });

  it("cache após resolução: conversa fechada sai de Minhas conversas", () => {
    expect(filtrarPorEscopo([conv({ status: "closed" })], ctxJean)).toHaveLength(0);
    expect(
      filtrarPorEscopo([conv({ status: "closed" })], { ...ctxJean, escopo: "fechadas" }),
    ).toHaveLength(1);
  });

  it("cache após reabertura: volta para a Nina, não para o último humano", () => {
    const reaberta = conv({ status: "active", owner_type: "AI", atribuida_user_id: null });
    expect(filtrarPorEscopo([reaberta], ctxJean)).toHaveLength(0);
    expect(filtrarPorEscopo([reaberta], { ...ctxJean, escopo: "nina" })).toHaveLength(1);
    expect(filtrarPorEscopo([reaberta], { ...ctxJean, escopo: "fechadas" })).toHaveLength(0);
  });

  it("evento em tempo real de conversa de outro atendente não entra na lista", () => {
    expect(podeEntrarNaLista(conv({ atribuida_user_id: MARIA }), ctxJean)).toBe(false);
    expect(podeEntrarNaLista(conv(), ctxJean)).toBe(true);
  });

  it("busca não revela conversa de outro responsável", () => {
    const daMaria = conv({ atribuida_user_id: MARIA });
    expect(
      selecaoDeveSair({ selecionada: daMaria, linhas: [], buscando: true, ctx: ctxJean }),
    ).toBe(true);
    expect(
      selecaoDeveSair({ selecionada: conv(), linhas: [], buscando: true, ctx: ctxJean }),
    ).toBe(false);
    expect(
      selecaoDeveSair({ selecionada: conv(), linhas: [], buscando: false, ctx: ctxJean }),
    ).toBe(true);
  });

  it("contadores acompanham mudanças rápidas entre filtros", () => {
    const base: ContadoresInbox = {
      minhas: 8,
      nina: 10,
      nao_atribuidas: 4,
      fechadas: 2,
      equipe: 24,
    };
    const depois = moverContador(base, "nina", "minhas");
    expect(depois.nina).toBe(9);
    expect(depois.minhas).toBe(9);
    expect(ajustarContadorAtual(base, "minhas", 7).minhas).toBe(7);
    expect(ajustarContadorAtual(base, "minhas", 8)).toBe(base);
    expect(moverContador({ ...base, nina: 0 }, "nina", null).nina).toBe(0);
  });

  it("troca de filtro/usuário usa caixas de dados diferentes", () => {
    const a = chaveInbox({ clinicaId: "cl", userId: JEAN, escopo: "minhas" });
    expect(a).not.toBe(chaveInbox({ clinicaId: "cl", userId: JEAN, escopo: "nina" }));
    expect(a).not.toBe(chaveInbox({ clinicaId: "cl", userId: MARIA, escopo: "minhas" }));
    expect(a).toBe(chaveInbox({ clinicaId: "cl", userId: JEAN, escopo: "minhas" }));
  });

  it("sem id de usuário carregado, mantém o que o servidor já filtrou", () => {
    const linhas = [conv({ atribuida_user_id: MARIA })];
    expect(filtrarPorEscopo(linhas, { ...ctxJean, userId: null })).toBe(linhas);
  });
});
