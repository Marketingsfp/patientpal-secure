import { describe, expect, it } from "bun:test";
import {
  faixaEsperaAtd,
  faixaEsperaDesde,
  formatarEspera,
  minutosDesde,
  rotuloEspera,
} from "./espera";

describe("faixaEsperaAtd", () => {
  it("0–4 min é normal", () => {
    expect(faixaEsperaAtd(0)).toBe("normal");
    expect(faixaEsperaAtd(4)).toBe("normal");
  });
  it("5–10 min é atenção", () => {
    expect(faixaEsperaAtd(5)).toBe("atencao");
    expect(faixaEsperaAtd(9)).toBe("atencao");
    expect(faixaEsperaAtd(10)).toBe("atencao");
  });
  it("mais de 10 min é crítico", () => {
    expect(faixaEsperaAtd(10.001)).toBe("critico");
    expect(faixaEsperaAtd(120)).toBe("critico");
  });
});

describe("faixaEsperaDesde", () => {
  const inicio = "2026-09-20T12:00:00Z";
  const tempo = Date.parse(inicio);

  it("compara o tempo exato, sem esperar pelo arredondamento para 11 minutos", () => {
    expect(faixaEsperaDesde(inicio, tempo + 599_999)).toBe("atencao");
    expect(faixaEsperaDesde(inicio, tempo + 600_000)).toBe("atencao");
    expect(faixaEsperaDesde(inicio, tempo + 600_001)).toBe("critico");
  });

  it("sem espera válida não produz alerta", () => {
    expect(faixaEsperaDesde(null, tempo)).toBe("normal");
    expect(faixaEsperaDesde("data-invalida", tempo)).toBe("normal");
    expect(faixaEsperaDesde(inicio, tempo - 1)).toBe("normal");
  });
});

describe("formatarEspera", () => {
  it("mostra minutos até 1 hora", () => {
    expect(formatarEspera(2)).toBe("2 min");
    expect(formatarEspera(49)).toBe("49 min");
  });
  it("mostra horas depois de 1 hora", () => {
    expect(formatarEspera(65)).toBe("1h 05min");
    expect(formatarEspera(140)).toBe("2h 20min");
  });
  it("mostra dias em esperas muito longas", () => {
    expect(formatarEspera(26 * 60)).toBe("1d 2h");
  });
});

describe("minutosDesde", () => {
  it("usa o timestamp real — recarregar a tela não zera", () => {
    const agora = Date.parse("2026-09-05T12:00:00Z");
    expect(minutosDesde("2026-09-05T11:52:00Z", agora)).toBe(8);
  });
  it("sem timestamp (nada pendente) devolve 0", () => {
    expect(minutosDesde(null)).toBe(0);
    expect(minutosDesde("data-invalida")).toBe(0);
  });
});

describe("rotuloEspera", () => {
  it("descreve a espera para leitor de tela", () => {
    expect(rotuloEspera(12)).toBe("Paciente aguardando resposta há 12 min");
  });
});
