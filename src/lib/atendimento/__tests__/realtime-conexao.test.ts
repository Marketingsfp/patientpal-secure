import { describe, expect, it } from "bun:test";
import { chaveCanalAtendimento, criarMaquinaConexao } from "../realtime-conexao";

describe("FASE 1 — conexão de tempo real da Inbox", () => {
  it("janela crítica: mudança perdida antes da assinatura é recuperada no SUBSCRIBED", () => {
    // T0/T1 — lista inicial já carregada, sem a conversa X.
    let lista = ["A", "B"];
    const servidor = ["A", "B"];
    const reconciliar = () => {
      lista = [...servidor];
    };

    const m = criarMaquinaConexao();
    // T2 — transferência acontece no banco; T3/T4 — canal ainda não assinou.
    servidor.push("X");
    expect(lista).not.toContain("X");

    // T5 — canal confirma.
    const acao = m.aplicar("SUBSCRIBED");
    expect(acao.reconciliar).toBe(true);
    if (acao.reconciliar) reconciliar();

    // T6 — a conversa transferida aparece sem F5.
    expect(lista).toContain("X");
  });

  it("primeira assinatura reconcilia exatamente uma vez", () => {
    const m = criarMaquinaConexao();
    let n = 0;
    for (const s of ["SUBSCRIBED", "SUBSCRIBED", "SUBSCRIBED"]) {
      if (m.aplicar(s).reconciliar) n++;
    }
    expect(n).toBe(1);
    expect(m.estado()).toBe("SUBSCRIBED");
  });

  it("erro do canal marca degradado e a volta reconcilia", () => {
    const m = criarMaquinaConexao();
    expect(m.aplicar("SUBSCRIBED").reconciliar).toBe(true);
    expect(m.aplicar("CHANNEL_ERROR").estado).toBe("DEGRADED");
    expect(m.aplicar("SUBSCRIBED").reconciliar).toBe(true);
  });

  it("tempo esgotado e fechamento não são ignorados em silêncio", () => {
    const m1 = criarMaquinaConexao();
    m1.aplicar("SUBSCRIBED");
    expect(m1.aplicar("TIMED_OUT").estado).toBe("DEGRADED");

    const m2 = criarMaquinaConexao();
    m2.aplicar("SUBSCRIBED");
    expect(m2.aplicar("CLOSED").estado).toBe("DISCONNECTED");
    expect(m2.aplicar("SUBSCRIBED").reconciliar).toBe(true);
  });

  it("trocar 20 conversas não muda o canal (nada é recriado)", () => {
    const chaves = new Set<string>();
    for (let i = 0; i < 20; i++) {
      chaves.add(chaveCanalAtendimento("cl-1", "montagem-1"));
    }
    expect(chaves.size).toBe(1);
    expect(chaveCanalAtendimento("cl-1", "montagem-1")).not.toBe(
      chaveCanalAtendimento("cl-2", "montagem-1"),
    );
  });
});
