import { describe, expect, it } from "bun:test";
import {
  contadorNaoAtribuidas,
  ordenarFilaNaoAtribuidas,
  simularRedistribuicao,
  type CandidatoDistribuicao,
  type ItemNaoAtribuida,
} from "./telefonia-elegibilidade";

const atendente = (
  userId: string,
  extra: Partial<CandidatoDistribuicao> = {},
): CandidatoDistribuicao => ({
  userId,
  temTelefonia: true,
  status: "ONLINE",
  cargaAtiva: 0,
  capacidadeMaxima: 20,
  ...extra,
});

const fila = (n: number, extra: Partial<ItemNaoAtribuida> = {}): ItemNaoAtribuida[] =>
  Array.from({ length: n }, (_, i) => ({
    conversationId: `c${String(i + 1).padStart(2, "0")}`,
    handoffReason: "precisa_humano",
    enteredUnassignedAt: `2026-09-08T10:${String(i).padStart(2, "0")}:00Z`,
    prioridade: 0,
    ...extra,
  }));

describe("FASE 4 — redistribuição de Não atribuídas", () => {
  it("ordena por prioridade e depois pela mais antiga", () => {
    const ordenada = ordenarFilaNaoAtribuidas([
      { conversationId: "b", enteredUnassignedAt: "2026-09-08T09:00:00Z", prioridade: 0 },
      { conversationId: "a", enteredUnassignedAt: "2026-09-08T11:00:00Z", prioridade: 5 },
      { conversationId: "c", enteredUnassignedAt: "2026-09-08T08:00:00Z", prioridade: 0 },
    ]);
    expect(ordenada.map((i) => i.conversationId)).toEqual(["a", "c", "b"]);
  });

  it("10 na fila e 1 atendente Online: todas vão para ela", () => {
    const r = simularRedistribuicao([atendente("jean")], fila(10));
    expect(r.atribuicoes).toHaveLength(10);
    expect(contadorNaoAtribuidas(r.restantes)).toBe(0);
  });

  it("3 atendentes Online: distribui equilibrado, não tudo para a primeira", () => {
    const r = simularRedistribuicao(
      [atendente("a"), atendente("b"), atendente("c")],
      fila(9),
    );
    const porUsuario = r.atribuicoes.reduce<Record<string, number>>((acc, x) => {
      acc[x.userId] = (acc[x.userId] ?? 0) + 1;
      return acc;
    }, {});
    expect(porUsuario).toEqual({ a: 3, b: 3, c: 3 });
  });

  it("duas entrando Online juntas: nenhuma conversa é atribuída duas vezes", () => {
    const r = simularRedistribuicao([atendente("a"), atendente("b")], fila(6));
    const ids = r.atribuicoes.map((x) => x.conversationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("atendente entra em pausa no meio: a vez passa para outra", () => {
    let chamadas = 0;
    const r = simularRedistribuicao([atendente("a"), atendente("b")], fila(4), {
      revalidar: (userId) => {
        chamadas++;
        if (userId === "a" && chamadas > 2) return atendente("a", { emPausa: true });
        return null;
      },
    });
    expect(r.atribuicoes.filter((x) => x.userId === "b").length).toBeGreaterThan(0);
    expect(contadorNaoAtribuidas(r.restantes)).toBe(0);
  });

  it("unidade incompatível não trava a fila: as demais seguem sendo distribuídas", () => {
    const candidatos = [atendente("a", { departamentos: ["recepcao"] })];
    const item = (id: string, dep: string): ItemNaoAtribuida => ({
      conversationId: id,
      enteredUnassignedAt: "2026-09-08T10:00:00Z",
      departamentoId: dep,
    });
    const r = simularRedistribuicao(candidatos, [
      item("x", "exames"),
      item("y", "recepcao"),
    ]);
    expect(r.atribuicoes.map((a) => a.conversationId)).toContain("y");
    expect(r.restantes).toHaveLength(0); // setor sem ninguém cai no pool geral
  });

  it("ninguém elegível: tudo permanece Não atribuídas", () => {
    const r = simularRedistribuicao(
      [atendente("a", { temTelefonia: false }), atendente("b", { status: "OFFLINE" })],
      fila(3),
    );
    expect(r.atribuicoes).toHaveLength(0);
    expect(contadorNaoAtribuidas(r.restantes)).toBe(3);
  });
});
