import { describe, expect, it } from "bun:test";
import {
  conversaEhDaNina,
  shouldShowNinaBadge,
  statusEhRepresentacaoDaNina,
  tiposDeBadgeDoCard,
} from "../badge-nina";

/** Conta quantos indicadores "✦ Nina" o card renderizaria. */
function badgesNina(c: Parameters<typeof tiposDeBadgeDoCard>[0]) {
  return tiposDeBadgeDoCard(c).filter((t) => t === "nina").length;
}

describe("indicador único da Nina no card", () => {
  it("TESTE 1 — conversa da Nina renderiza exatamente 1 badge", () => {
    expect(badgesNina({ status: "bot_attending", owner_type: "AI" })).toBe(1);
  });

  it("TESTE 2 — todas as marcações da Nina ativas ainda produzem 1 badge", () => {
    expect(
      badgesNina({
        status: "bot_attending",
        owner_type: "AI",
        handoff_motivo: "patient_response_timeout",
        atribuida_user_id: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBe(1);
    expect(badgesNina({ status: "bot_attending", owner_type: "HUMAN" })).toBe(1);
    expect(badgesNina({ status: "active", owner_type: "AI" })).toBe(1);
  });

  it("TESTE 3 — conversa sem Nina renderiza 0 badges Nina", () => {
    expect(badgesNina({ status: "active", owner_type: "HUMAN" })).toBe(0);
    expect(badgesNina({ status: "closed", owner_type: "NONE" })).toBe(0);
  });

  it("TESTES 4/5/6 — decisão pura: reload, realtime e troca de filtro não somam badges", () => {
    const conversa = { status: "bot_attending", owner_type: "AI" };
    for (let i = 0; i < 10; i++) expect(badgesNina({ ...conversa })).toBe(1);
  });

  it("nenhum tipo de badge se repete no card", () => {
    const tipos = tiposDeBadgeDoCard({
      status: "bot_attending",
      owner_type: "AI",
      handoff_motivo: "patient_response_timeout",
      atribuida_user_id: "22222222-2222-2222-2222-222222222222",
    });
    expect(new Set(tipos).size).toBe(tipos.length);
  });

  it("status deixa de aparecer só quando seria uma segunda Nina", () => {
    expect(tiposDeBadgeDoCard({ status: "bot_attending", owner_type: "AI" })).not.toContain("status");
    expect(tiposDeBadgeDoCard({ status: "active", owner_type: "AI" })).toContain("status");
  });

  it("Nina não substitui o responsável humano: os dois selos coexistem", () => {
    const tipos = tiposDeBadgeDoCard({
      status: "bot_attending",
      owner_type: "AI",
      atribuida_user_id: "33333333-3333-3333-3333-333333333333",
    });
    expect(tipos.filter((t) => t === "nina").length).toBe(1);
    expect(tipos).toContain("responsavel");
  });

  it("ordem dos badges é estável", () => {
    expect(
      tiposDeBadgeDoCard({
        status: "active",
        owner_type: "HUMAN",
        handoff_motivo: "patient_response_timeout",
        atribuida_user_id: "44444444-4444-4444-4444-444444444444",
      }),
    ).toEqual(["status", "humano", "timeout-nina", "responsavel"]);
  });

  it("é tolerante a conversa nula ou campos ausentes", () => {
    expect(conversaEhDaNina(null)).toBe(false);
    expect(shouldShowNinaBadge({})).toBe(false);
    expect(tiposDeBadgeDoCard(null)).toEqual([]);
    expect(statusEhRepresentacaoDaNina(null)).toBe(false);
  });
});
