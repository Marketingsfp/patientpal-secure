import { describe, expect, it } from "bun:test";
import {
  addDias,
  diasDoPeriodo,
  mesmoDiaAnoAnterior,
  periodoComparacao,
  presetAtivo,
  PRESETS_PERIODO,
  ultimoDiaDoMes,
  variacao,
} from "./periodos";

const preset = (label: string) => PRESETS_PERIODO.find((p) => p.label === label)!;

describe("atalhos de periodo", () => {
  const hoje = "2026-08-26";

  it("Hoje e Ontem cobrem um unico dia", () => {
    expect(preset("Hoje").make(hoje)).toEqual({ de: "2026-08-26", ate: "2026-08-26" });
    expect(preset("Ontem").make(hoje)).toEqual({ de: "2026-08-25", ate: "2026-08-25" });
  });

  it("as janelas de dias incluem o dia de hoje", () => {
    expect(preset("7d").make(hoje)).toEqual({ de: "2026-08-20", ate: "2026-08-26" });
    expect(preset("15d").make(hoje)).toEqual({ de: "2026-08-12", ate: "2026-08-26" });
    expect(preset("30d").make(hoje)).toEqual({ de: "2026-07-28", ate: "2026-08-26" });
    expect(diasDoPeriodo(preset("30d").make(hoje))).toBe(30);
  });

  it("Este mes vai do dia 1o ate hoje e Mes anterior fecha o mes inteiro", () => {
    expect(preset("Este mês").make(hoje)).toEqual({ de: "2026-08-01", ate: "2026-08-26" });
    expect(preset("Mês anterior").make(hoje)).toEqual({ de: "2026-07-01", ate: "2026-07-31" });
  });

  it("Mes anterior atravessa a virada do ano", () => {
    expect(preset("Mês anterior").make("2026-01-10")).toEqual({
      de: "2025-12-01",
      ate: "2025-12-31",
    });
  });

  it("Este ano comeca em 1o de janeiro", () => {
    expect(preset("Este ano").make(hoje)).toEqual({ de: "2026-01-01", ate: "2026-08-26" });
  });

  it("reconhece qual atalho corresponde ao periodo escolhido", () => {
    expect(presetAtivo({ de: "2026-08-01", ate: "2026-08-26" }, hoje)).toBe("Este mês");
    expect(presetAtivo({ de: "2026-03-02", ate: "2026-04-09" }, hoje)).toBeNull();
  });
});

describe("periodoComparacao", () => {
  it("periodo anterior tem o mesmo tamanho e encosta na vespera", () => {
    const p = periodoComparacao({ de: "2026-08-12", ate: "2026-08-26" }, "anterior");
    expect(p).toEqual({ de: "2026-07-28", ate: "2026-08-11" });
    expect(diasDoPeriodo(p)).toBe(15);
  });

  it("um unico dia compara com o dia anterior", () => {
    expect(periodoComparacao({ de: "2026-08-26", ate: "2026-08-26" }, "anterior")).toEqual({
      de: "2026-08-25",
      ate: "2026-08-25",
    });
  });

  it("ano anterior mantem as mesmas datas com o ano trocado", () => {
    expect(periodoComparacao({ de: "2026-08-01", ate: "2026-08-31" }, "ano-anterior")).toEqual({
      de: "2025-08-01",
      ate: "2025-08-31",
    });
  });

  it("29 de fevereiro nao escorrega para marco no ano anterior", () => {
    expect(mesmoDiaAnoAnterior("2028-02-29")).toBe("2027-02-28");
  });

  it("personalizado devolve o intervalo digitado", () => {
    const custom = { de: "2025-01-01", ate: "2025-01-31" };
    expect(
      periodoComparacao({ de: "2026-08-01", ate: "2026-08-31" }, "personalizado", custom),
    ).toEqual(custom);
  });
});

describe("utilitarios de data pura", () => {
  it("soma dias atravessando o mes e o ano", () => {
    expect(addDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDias("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("acha o ultimo dia do mes, inclusive em fevereiro bissexto", () => {
    expect(ultimoDiaDoMes("2026-02-10")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2028-02-10")).toBe("2028-02-29");
  });
});

describe("variacao", () => {
  it("calcula diferenca nominal e percentual", () => {
    expect(variacao(150, 100)).toEqual({ valor: 50, percentual: 50 });
    expect(variacao(80, 100)).toEqual({ valor: -20, percentual: -20 });
  });

  it("sem base de comparacao o percentual fica indefinido, nao zero", () => {
    expect(variacao(500, 0)).toEqual({ valor: 500, percentual: null });
    expect(variacao(0, 0)).toEqual({ valor: 0, percentual: 0 });
  });
});
