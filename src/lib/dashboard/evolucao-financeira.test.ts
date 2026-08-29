import { describe, expect, it } from "bun:test";
import { agruparEvolucaoMensal, type SerieDiariaRow } from "./evolucao-financeira";

const linha = (data: string, tipo: string, total: number): SerieDiariaRow => ({
  data,
  tipo,
  total,
});

describe("agruparEvolucaoMensal", () => {
  it("soma os dias dentro de cada mês, separando receita de despesa", () => {
    const r = agruparEvolucaoMensal(
      [
        linha("2026-01-05", "receita", 100),
        linha("2026-01-20", "receita", 50),
        linha("2026-01-10", "despesa", 30),
        linha("2026-02-01", "receita", 200),
      ],
      2026,
      3,
    );
    expect(r.receitas).toEqual([150, 200, 0]);
    expect(r.despesas).toEqual([30, 0, 0]);
  });

  it("mostra o mês sem lançamento como zero, e não o omite", () => {
    const r = agruparEvolucaoMensal([linha("2026-03-01", "receita", 10)], 2026, 3);
    expect(r.labels).toEqual(["jan", "fev", "mar"]);
    expect(r.receitas).toEqual([0, 0, 10]);
  });

  it("calcula o resultado mês a mês", () => {
    const r = agruparEvolucaoMensal(
      [linha("2026-01-05", "receita", 100), linha("2026-01-06", "despesa", 40)],
      2026,
      1,
    );
    expect(r.resultados).toEqual([60]);
  });

  it("soma os totais do ano para a legenda", () => {
    const r = agruparEvolucaoMensal(
      [
        linha("2026-01-05", "receita", 100),
        linha("2026-05-05", "receita", 100),
        linha("2026-05-06", "despesa", 25),
      ],
      2026,
      12,
    );
    expect(r.totalReceita).toBe(200);
    expect(r.totalDespesa).toBe(25);
  });

  it("descarta linhas de outro ano", () => {
    const r = agruparEvolucaoMensal(
      [linha("2025-12-31", "receita", 999), linha("2026-01-01", "receita", 10)],
      2026,
      2,
    );
    expect(r.receitas).toEqual([10, 0]);
  });

  it("aceita data com hora e usa só os 10 primeiros caracteres", () => {
    const r = agruparEvolucaoMensal([linha("2026-04-09T00:00:00+00:00", "receita", 7)], 2026, 4);
    expect(r.receitas[3]).toBe(7);
  });

  it("total nulo no banco não vira NaN", () => {
    const r = agruparEvolucaoMensal(
      [{ data: "2026-01-02", tipo: "receita", total: null }],
      2026,
      1,
    );
    expect(r.receitas).toEqual([0]);
    expect(Number.isNaN(r.totalReceita)).toBe(false);
  });

  it("ignora tipos que não sejam receita ou despesa", () => {
    const r = agruparEvolucaoMensal([linha("2026-01-02", "transferencia", 500)], 2026, 1);
    expect(r.receitas).toEqual([0]);
    expect(r.despesas).toEqual([0]);
  });

  it("não desenha meses que ainda não aconteceram", () => {
    const r = agruparEvolucaoMensal([], 2026, 8);
    expect(r.labels).toEqual(["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago"]);
    expect(r.meses[7]).toBe("2026-08");
  });

  it("protege contra um mês fora da faixa", () => {
    expect(agruparEvolucaoMensal([], 2026, 0).labels).toHaveLength(1);
    expect(agruparEvolucaoMensal([], 2026, 99).labels).toHaveLength(12);
  });
});
