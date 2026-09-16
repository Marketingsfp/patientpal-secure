import { describe, expect, it } from "bun:test";
import { isSaoFranciscoDePaula, parcelasCarneSaoFrancisco } from "./print-carne";

const parcela = (numero_parcela: number, status = "pendente") => ({
  numero_parcela,
  vencimento: "2026-10-10",
  valor: 50,
  status,
  pago_em: status === "pago" ? "2026-09-10" : null,
});

describe("carnê da São Francisco de Paula", () => {
  it("reconhece a unidade pelo nome, com ou sem acento", () => {
    expect(isSaoFranciscoDePaula("POLICLINICA SAO FRANCISCO DE PAULA")).toBe(true);
    expect(isSaoFranciscoDePaula("Policlínica São Francisco de Paula")).toBe(true);
    expect(isSaoFranciscoDePaula("POLICLINICA MENINO JESUS")).toBe(false);
    expect(isSaoFranciscoDePaula(null)).toBe(false);
  });

  it("imprime a 1ª parcela mesmo já paga na emissão", () => {
    const itens = parcelasCarneSaoFrancisco([
      parcela(0, "pago"),
      parcela(1, "pago"),
      ...Array.from({ length: 11 }, (_, i) => parcela(i + 2)),
    ]);
    expect(itens.map((p) => p.rotulo)).toEqual(
      Array.from({ length: 12 }, (_, i) => `${i + 1}/12`),
    );
  });

  it("mantém N pelo maior número quando uma parcela foi cancelada", () => {
    const itens = parcelasCarneSaoFrancisco([
      parcela(1, "cancelado"),
      parcela(2),
      parcela(3),
    ]);
    expect(itens.map((p) => p.rotulo)).toEqual(["2/3", "3/3"]);
  });

  it("taxas em aberto vêm antes das mensalidades; taxas pagas não saem", () => {
    const itens = parcelasCarneSaoFrancisco([parcela(-1), parcela(0, "pago"), parcela(1)]);
    expect(itens.map((p) => p.rotulo)).toEqual(["Inclusão", "1/1"]);
  });
});
