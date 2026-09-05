import { describe, expect, it } from "bun:test";
import {
  mesclarConversa,
  mesclarEspera,
  mesclarListaConversas,
  ordenarPorRecentes,
} from "../inbox-merge";

const base = {
  id: "c1",
  contato_nome: "Maria",
  owner_type: "AI",
  atribuida_user_id: "u1",
  unread_count: 0,
  ultima_msg_preview: "oi",
  ultima_msg_em: "2026-09-05T10:00:00Z",
};

describe("inbox-merge", () => {
  it("atualiza só os campos novos e preserva o resto", () => {
    const r = mesclarConversa(base, {
      ...base,
      unread_count: 1,
      ultima_msg_preview: "a consulta é por ordem de chegada?",
      ultima_msg_em: "2026-09-05T10:05:00Z",
    });
    expect(r.unread_count).toBe(1);
    expect(r.owner_type).toBe("AI");
    expect(r.atribuida_user_id).toBe("u1");
  });

  it("payload parcial com nulos não apaga responsável nem preview", () => {
    const r = mesclarConversa(base, {
      id: "c1",
      atribuida_user_id: null,
      ultima_msg_preview: null,
      owner_type: null,
    } as any);
    expect(r.atribuida_user_id).toBe("u1");
    expect(r.ultima_msg_preview).toBe("oi");
    expect(r.owner_type).toBe("AI");
  });

  it("mantém a mesma referência quando nada muda (sem re-render)", () => {
    expect(mesclarConversa(base, { ...base })).toBe(base);
    const lista = [base];
    expect(mesclarListaConversas(lista, [{ ...base }])).toBe(lista);
  });

  it("evento duplicado não produz efeito visual diferente", () => {
    const nova = { ...base, unread_count: 2 };
    const um = mesclarListaConversas([base], [nova]);
    const dois = mesclarListaConversas(um, [{ ...nova }]);
    expect(dois).toBe(um);
  });

  it("ordena por mais recentes com desempate estável", () => {
    const a = { ...base, id: "a", ultima_msg_em: "2026-09-05T10:00:00Z" };
    const b = { ...base, id: "b", ultima_msg_em: "2026-09-05T11:00:00Z" };
    const c = { ...base, id: "c", ultima_msg_em: "2026-09-05T10:00:00Z" };
    expect(ordenarPorRecentes([a, b, c]).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(ordenarPorRecentes([c, b, a]).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("lista já ordenada mantém a referência", () => {
    const lista = [base];
    expect(ordenarPorRecentes(lista)).toBe(lista);
  });

  it("mapa de espera igual mantém a referência", () => {
    const m = { c1: "2026-09-05T10:00:00Z" };
    expect(mesclarEspera(m, { c1: "2026-09-05T10:00:00Z" })).toBe(m);
    expect(mesclarEspera(m, {})).not.toBe(m);
  });
});
