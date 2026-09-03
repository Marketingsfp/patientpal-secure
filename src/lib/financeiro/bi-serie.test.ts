import { describe, expect, it } from "bun:test";
import {
  agruparSerie,
  granularidadeDoIntervalo,
  totaisDaSerie,
  type LinhaSerieDiaria,
} from "./bi-serie";

describe("granularidadeDoIntervalo", () => {
  it("um dia só é agrupado por dia", () => {
    expect(granularidadeDoIntervalo({ from: "2026-09-03", to: "2026-09-03" })).toBe("dia");
  });

  it("mês fechado ainda é agrupado por dia", () => {
    expect(granularidadeDoIntervalo({ from: "2026-09-01", to: "2026-09-30" })).toBe("dia");
  });

  it("período longo passa a ser agrupado por mês", () => {
    expect(granularidadeDoIntervalo({ from: "2026-01-01", to: "2026-09-30" })).toBe("mes");
  });
});

describe("agruparSerie por dia", () => {
  it("mantém no eixo os dias sem movimento", () => {
    const pontos = agruparSerie([], { from: "2026-09-01", to: "2026-09-03" });
    expect(pontos.map((p) => p.label)).toEqual(["01/09", "02/09", "03/09"]);
    expect(pontos.every((p) => p.receitas === 0 && p.despesas === 0)).toBe(true);
  });

  it("soma receitas e despesas do mesmo dia separadamente", () => {
    const rows: LinhaSerieDiaria[] = [
      { data: "2026-09-02", tipo: "receita", total: 100 },
      { data: "2026-09-02", tipo: "receita", total: "50.5" },
      { data: "2026-09-02", tipo: "despesa", total: 30 },
    ];
    const pontos = agruparSerie(rows, { from: "2026-09-01", to: "2026-09-02" });
    expect(pontos[1]).toEqual({
      chave: "2026-09-02",
      label: "02/09",
      receitas: 150.5,
      despesas: 30,
    });
  });

  it("descarta linha fora do intervalo pedido", () => {
    const rows: LinhaSerieDiaria[] = [
      { data: "2026-08-31", tipo: "receita", total: 999 },
      { data: "2026-09-01", tipo: "receita", total: 10 },
    ];
    const { receitas } = totaisDaSerie(
      agruparSerie(rows, { from: "2026-09-01", to: "2026-09-01" }),
    );
    expect(receitas).toBe(10);
  });
});

describe("agruparSerie por mês", () => {
  it("cria uma barra por mês do intervalo, inclusive na virada de ano", () => {
    const pontos = agruparSerie([], { from: "2025-11-15", to: "2026-02-10" }, "mes");
    expect(pontos.map((p) => p.label)).toEqual(["Nov/25", "Dez/25", "Jan/26", "Fev/26"]);
  });

  it("junta os dias do mesmo mês na mesma barra", () => {
    const rows: LinhaSerieDiaria[] = [
      { data: "2026-04-01", tipo: "receita", total: 100 },
      { data: "2026-04-30", tipo: "receita", total: 200 },
      { data: "2026-05-10", tipo: "despesa", total: 70 },
    ];
    const pontos = agruparSerie(rows, { from: "2026-04-01", to: "2026-05-31" }, "mes");
    expect(pontos.map((p) => [p.label, p.receitas, p.despesas])).toEqual([
      ["Abr/26", 300, 0],
      ["Mai/26", 0, 70],
    ]);
  });
});

describe("totaisDaSerie", () => {
  it("saldo é receitas menos despesas", () => {
    const rows: LinhaSerieDiaria[] = [
      { data: "2026-09-01", tipo: "receita", total: 500 },
      { data: "2026-09-02", tipo: "despesa", total: 120 },
    ];
    const pontos = agruparSerie(rows, { from: "2026-09-01", to: "2026-09-03" });
    expect(totaisDaSerie(pontos)).toEqual({ receitas: 500, despesas: 120, saldo: 380 });
  });

  it("intervalo invertido não devolve barra nenhuma", () => {
    expect(agruparSerie([], { from: "2026-09-10", to: "2026-09-01" })).toEqual([]);
  });
});
