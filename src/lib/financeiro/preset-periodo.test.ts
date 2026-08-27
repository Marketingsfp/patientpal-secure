import { describe, expect, it } from "bun:test";
import { computeRange, dataBR, descricaoDoPreset, diasDoIntervalo } from "./preset-periodo";

/** 27/08/2026 é uma quinta-feira — a semana dela vai de domingo 23 a sábado 29. */
const QUINTA = new Date(2026, 7, 27, 15, 30);

describe("computeRange", () => {
  it("Dia cobre só o dia de referência", () => {
    expect(computeRange("hoje", QUINTA)).toEqual({ from: "2026-08-27", to: "2026-08-27" });
  });

  it("Semana vai de domingo a sábado", () => {
    expect(computeRange("semana", QUINTA)).toEqual({ from: "2026-08-23", to: "2026-08-29" });
  });

  it("Semana atravessa a virada de mês sem perder dias", () => {
    // 02/09/2026 é quarta; o domingo dela ainda é agosto.
    expect(computeRange("semana", new Date(2026, 8, 2))).toEqual({
      from: "2026-08-30",
      to: "2026-09-05",
    });
  });

  it("Quinzena é 1 a 15 na primeira metade do mês", () => {
    expect(computeRange("quinzena", new Date(2026, 7, 10))).toEqual({
      from: "2026-08-01",
      to: "2026-08-15",
    });
  });

  it("Quinzena é 16 até o último dia na segunda metade", () => {
    expect(computeRange("quinzena", QUINTA)).toEqual({ from: "2026-08-16", to: "2026-08-31" });
    // Fevereiro fecha no dia certo, inclusive bissexto.
    expect(computeRange("quinzena", new Date(2028, 1, 20))).toEqual({
      from: "2028-02-16",
      to: "2028-02-29",
    });
  });

  it("Mês vai do dia 1 ao último dia", () => {
    expect(computeRange("mes", QUINTA)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(computeRange("mes", new Date(2026, 1, 5))).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });
});

describe("diasDoIntervalo", () => {
  it("conta as duas pontas", () => {
    expect(diasDoIntervalo({ from: "2026-08-23", to: "2026-08-29" })).toBe(7);
    expect(diasDoIntervalo({ from: "2026-08-27", to: "2026-08-27" })).toBe(1);
    expect(diasDoIntervalo({ from: "2026-08-01", to: "2026-08-31" })).toBe(31);
  });
});

describe("dataBR", () => {
  it("converte a data pura sem passar por fuso", () => {
    expect(dataBR("2026-08-27")).toBe("27/08/2026");
    expect(dataBR("")).toBe("—");
  });
});

describe("descricaoDoPreset", () => {
  it("anuncia o intervalo exato da semana", () => {
    const d = descricaoDoPreset("semana", undefined, QUINTA);
    expect(d.resumo).toBe("Semana atual: 23/08/2026 a 29/08/2026");
    expect(d.duracao).toBe("7 dias");
    expect(d.regra).toContain("domingo a sábado");
  });

  it("num dia só mostra a data sozinha, sem 'a'", () => {
    const d = descricaoDoPreset("hoje", undefined, QUINTA);
    expect(d.resumo).toBe("Hoje: 27/08/2026");
    expect(d.duracao).toBe("1 dia");
  });

  it("Período usa as datas digitadas, não um recorte calculado", () => {
    const d = descricaoDoPreset("periodo", { from: "2026-01-10", to: "2026-03-05" }, QUINTA);
    expect(d.resumo).toBe("Período personalizado: 10/01/2026 a 05/03/2026");
    expect(d.dias).toBe(55);
  });

  it("as demais pílulas ignoram o que está digitado — a dica diz o que ELAS aplicariam", () => {
    const digitado = { from: "2026-01-10", to: "2026-03-05" };
    expect(descricaoDoPreset("mes", digitado, QUINTA).intervalo).toBe("01/08/2026 a 31/08/2026");
  });
});
