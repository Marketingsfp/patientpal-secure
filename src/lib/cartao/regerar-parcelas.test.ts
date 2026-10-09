import { describe, expect, it } from "bun:test";
import { planejarRegeracao, type ParcelaAtual } from "./regerar-parcelas";

const p = (
  id: string,
  numero: number,
  vencimento: string,
  status = "pendente",
  travada = false,
): ParcelaAtual => ({ id, numero_parcela: numero, vencimento, status, travada });

describe("planejarRegeracao", () => {
  it("contrato só com pendentes: apaga tudo e refaz as 12, as N primeiras pagas", () => {
    const atuais = Array.from({ length: 12 }, (_, i) =>
      p(`x${i}`, i + 1, `2026-${String(i + 1).padStart(2, "0")}-10`),
    );
    const r = planejarRegeracao("2026-03-05", 10, 2, atuais);
    expect(r.apagar).toHaveLength(12);
    expect(r.criar).toHaveLength(12);
    expect(r.criar[0]).toEqual({ numero_parcela: 1, vencimento: "2026-03-10", paga: true });
    expect(r.criar[1].paga).toBe(true);
    expect(r.criar[2].paga).toBe(false);
    expect(r.criar[11].vencimento).toBe("2027-02-10");
  });

  it("parcela paga nunca é apagada e o mês dela não é recriado", () => {
    const r = planejarRegeracao("2026-07-01", 10, 0, [
      p("paga", 1, "2026-07-10", "pago"),
      p("pend", 2, "2026-08-10"),
    ]);
    expect(r.apagar).toEqual(["pend"]);
    expect(r.pagasMantidas).toBe(1);
    expect(r.criar.map((c) => c.vencimento.slice(0, 7))).not.toContain("2026-07");
    expect(r.criar).toHaveLength(11);
  });

  it("parcela cancelada fica, mas o mês dela volta a ser gerado", () => {
    const r = planejarRegeracao("2026-07-01", 10, 0, [p("canc", 1, "2026-07-10", "cancelado")]);
    expect(r.apagar).toEqual([]);
    expect(r.criar).toHaveLength(12);
    // O número 1 está com a cancelada; o mês de julho vai para o próximo livre.
    expect(r.criar[0]).toEqual({ numero_parcela: 13, vencimento: "2026-07-10", paga: false });
  });

  it("pendente com boleto ou guia fica e ocupa o mês", () => {
    const r = planejarRegeracao("2026-07-01", 10, 0, [p("bol", 2, "2026-08-10", "pendente", true)]);
    expect(r.apagar).toEqual([]);
    expect(r.criar.map((c) => c.vencimento)).not.toContain("2026-08-10");
    expect(r.criar).toHaveLength(11);
  });

  it("taxa de adesão (parcela 0) não entra na conta", () => {
    const r = planejarRegeracao("2026-07-01", 10, 0, [p("ades", 0, "2026-07-01", "pendente")]);
    expect(r.apagar).toEqual([]);
    expect(r.criar).toHaveLength(12);
  });

  it("dia 31 cai no último dia do mês", () => {
    const r = planejarRegeracao("2027-01-15", 31, 0, []);
    expect(r.criar[1].vencimento).toBe("2027-02-28");
  });
});
