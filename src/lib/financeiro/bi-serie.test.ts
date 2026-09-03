import { describe, expect, it } from "bun:test";
import {
  agruparSerie,
  granularidadeDoIntervalo,
  janelaDaSerie,
  matrizAtendimentos,
  serieAtendimentos,
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

describe("serieAtendimentos", () => {
  /** 15/09/2026 — a janela de 12 meses vai de Out/25 a Set/26. */
  const REF = new Date(2026, 8, 15);

  it("respeita o mes 0-11 que a RPC devolve", () => {
    // mes 8 = setembro. Se alguem somar 1 aqui, o valor cai em outubro.
    const serie = serieAtendimentos(
      [{ ano: 2026, mes: 8, cartao: 5, particular: 716, exames: 459 }],
      12,
      REF,
    );
    const ultimo = serie[serie.length - 1];
    expect(ultimo.label).toBe("Set/26");
    expect(ultimo).toEqual({ label: "Set/26", cartao: 5, particular: 716, exames: 459 });
  });

  it("monta 12 meses em ordem, terminando no mes de referencia", () => {
    const serie = serieAtendimentos([], 12, REF);
    expect(serie.length).toBe(12);
    expect(serie[0].label).toBe("Out/25");
    expect(serie[11].label).toBe("Set/26");
  });

  it("aceita numero em texto, como vem do PostgREST", () => {
    const serie = serieAtendimentos(
      [{ ano: "2026", mes: "7", cartao: "11", particular: "1846", exames: "1561" }],
      2,
      REF,
    );
    expect(serie[0]).toEqual({ label: "Ago/26", cartao: 11, particular: 1846, exames: 1561 });
  });

  it("ignora linha com mes fora de 0-11", () => {
    const serie = serieAtendimentos(
      [{ ano: 2026, mes: 12, cartao: 99, particular: 99, exames: 99 }],
      12,
      REF,
    );
    expect(serie.every((p) => p.cartao === 0 && p.particular === 0 && p.exames === 0)).toBe(true);
  });
});

describe("matrizAtendimentos", () => {
  it("soma o ano e o total geral", () => {
    const m = matrizAtendimentos([
      { ano: 2026, mes: 0, cartao: 515, particular: 7759, exames: 42 },
      { ano: 2026, mes: 1, cartao: 439, particular: 6685, exames: 25 },
    ]);
    expect(m.anos).toEqual([2026]);
    expect(m.totalPorAno[2026].total).toBe(515 + 7759 + 42 + 439 + 6685 + 25);
    expect(m.totalGeral).toBe(m.totalPorAno[2026].total);
    expect(m.linhas.length).toBe(12);
    expect(m.linhas[2].porAno[2026]).toEqual({
      cartao: 0,
      particular: 0,
      exames: 0,
      total: 0,
    });
  });

  it("sem linha nenhuma devolve matriz vazia", () => {
    expect(matrizAtendimentos(null)).toEqual({
      anos: [],
      linhas: matrizAtendimentos(null).linhas,
      totalPorAno: {},
      totalGeral: 0,
    });
  });
});

describe("janelaDaSerie", () => {
  it("vai do dia 1 do mes mais antigo ate a data de referencia", () => {
    expect(janelaDaSerie(12, new Date(2026, 8, 15))).toEqual({
      from: "2025-10-01",
      to: "2026-09-15",
    });
  });
});
