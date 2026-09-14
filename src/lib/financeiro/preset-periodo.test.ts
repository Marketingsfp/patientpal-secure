import { describe, expect, it } from "bun:test";
import {
  computeRange,
  dataBR,
  descricaoDoPreset,
  diasDeFuncionamento,
  diasDoIntervalo,
} from "./preset-periodo";

/** 27/08/2026 é uma quinta-feira — a semana de funcionamento vai de segunda 24 a sábado 29. */
const QUINTA = new Date(2026, 7, 27, 15, 30);

describe("computeRange", () => {
  it("Dia cobre só o dia de referência", () => {
    expect(computeRange("hoje", QUINTA)).toEqual({ from: "2026-08-27", to: "2026-08-27" });
  });

  it("Semana vai de segunda a sábado", () => {
    expect(computeRange("semana", QUINTA)).toEqual({ from: "2026-08-24", to: "2026-08-29" });
  });

  it("numa segunda-feira a Semana não abre no domingo anterior (caso de 14/09/2026)", () => {
    expect(computeRange("semana", new Date(2026, 8, 14, 9))).toEqual({
      from: "2026-09-14",
      to: "2026-09-19",
    });
  });

  it("no domingo a Semana é a de funcionamento que acabou de fechar", () => {
    expect(computeRange("semana", new Date(2026, 8, 13))).toEqual({
      from: "2026-09-07",
      to: "2026-09-12",
    });
  });

  it("Semana atravessa a virada de mês sem perder dias", () => {
    // 02/09/2026 é quarta; a segunda dela ainda é agosto.
    expect(computeRange("semana", new Date(2026, 8, 2))).toEqual({
      from: "2026-08-31",
      to: "2026-09-05",
    });
  });

  it("Quinzena é 1 a 15 na primeira metade do mês", () => {
    expect(computeRange("quinzena", new Date(2026, 7, 10))).toEqual({
      from: "2026-08-01",
      to: "2026-08-15",
    });
  });

  it("Quinzena não começa nem termina em domingo", () => {
    // 01/11/2026 é domingo; 15/11/2026 também.
    expect(computeRange("quinzena", new Date(2026, 10, 5))).toEqual({
      from: "2026-11-02",
      to: "2026-11-14",
    });
    // 16/08/2026 é domingo.
    expect(computeRange("quinzena", QUINTA)).toEqual({ from: "2026-08-17", to: "2026-08-31" });
  });

  it("Quinzena é 16 até o último dia na segunda metade", () => {
    expect(computeRange("quinzena", new Date(2026, 8, 20))).toEqual({
      from: "2026-09-16",
      to: "2026-09-30",
    });
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

describe("diasDeFuncionamento", () => {
  it("desconta os domingos", () => {
    // 01 a 15/09/2026 tem dois domingos (06 e 13).
    expect(diasDeFuncionamento({ from: "2026-09-01", to: "2026-09-15" })).toBe(13);
    expect(diasDeFuncionamento({ from: "2026-09-14", to: "2026-09-19" })).toBe(6);
    expect(diasDeFuncionamento({ from: "2026-09-13", to: "2026-09-13" })).toBe(0);
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
    expect(d.resumo).toBe("Semana atual: 24/08/2026 a 29/08/2026");
    expect(d.duracao).toBe("6 dias de funcionamento");
    expect(d.regra).toContain("segunda a sábado");
  });

  it("a quinzena anuncia só os dias de funcionamento", () => {
    const d = descricaoDoPreset("quinzena", undefined, new Date(2026, 8, 14));
    expect(d.intervalo).toBe("01/09/2026 a 15/09/2026");
    expect(d.duracao).toBe("13 dias de funcionamento");
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
