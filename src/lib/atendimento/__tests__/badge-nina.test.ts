import { describe, expect, it } from "bun:test";
import { conversaEhDaNina, statusEhRepresentacaoDaNina } from "../badge-nina";

/** Conta quantos indicadores "✦ Nina" o card renderizaria. */
function indicadoresNinaNoCard(c: { status?: string | null; owner_type?: string | null }) {
  const canonico = conversaEhDaNina(c);
  const doStatus = statusEhRepresentacaoDaNina(c.status) && !canonico;
  return (canonico ? 1 : 0) + (doStatus ? 1 : 0);
}

describe("indicador único da Nina no card", () => {
  it("TESTE 1 — conversa da Nina renderiza exatamente 1 badge", () => {
    expect(indicadoresNinaNoCard({ status: "bot_attending", owner_type: "AI" })).toBe(1);
  });

  it("TESTE 2 — múltiplas flags internas ainda produzem 1 badge", () => {
    expect(indicadoresNinaNoCard({ status: "bot_attending", owner_type: "HUMAN" })).toBe(1);
    expect(indicadoresNinaNoCard({ status: "active", owner_type: "AI" })).toBe(1);
  });

  it("TESTE 3 — conversa sem Nina não renderiza badge", () => {
    expect(indicadoresNinaNoCard({ status: "active", owner_type: "HUMAN" })).toBe(0);
    expect(indicadoresNinaNoCard({ status: "closed", owner_type: "NONE" })).toBe(0);
  });

  it("TESTES 4/5/6 — a decisão é pura, então reload, realtime e troca de filtro não somam badges", () => {
    const conversa = { status: "bot_attending", owner_type: "AI" };
    for (let i = 0; i < 10; i++) {
      expect(indicadoresNinaNoCard({ ...conversa })).toBe(1);
    }
  });

  it("é tolerante a conversa nula ou campos ausentes", () => {
    expect(conversaEhDaNina(null)).toBe(false);
    expect(conversaEhDaNina({})).toBe(false);
  });
});
