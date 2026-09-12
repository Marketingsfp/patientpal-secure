import { describe, expect, it } from "bun:test";
import { rangeFromPeriodo } from "./format";
import { hojeBR } from "@/lib/date-utils";
import { addDias } from "@/lib/financeiro/periodos";

/**
 * Os botões do filtro do Dashboard precisam devolver exatamente o mesmo
 * intervalo que a pessoa digitaria à mão em "Período".
 *
 * O caso que originou estes testes: "Ontem" devolvia 11/09 até 12/09 porque o
 * fim do dia era montado com hora local e depois lido em UTC, e o Dashboard
 * somava dois dias de caixa num botão que promete um.
 */
describe("rangeFromPeriodo", () => {
  it("Ontem é um dia só — o dia anterior", () => {
    const ontem = addDias(hojeBR(), -1);
    expect(rangeFromPeriodo("ontem")).toEqual({ from: ontem, to: ontem });
  });

  it("Hoje é um dia só — o de hoje no fuso da clínica", () => {
    const hoje = hojeBR();
    expect(rangeFromPeriodo("hoje")).toEqual({ from: hoje, to: hoje });
  });

  it("Semana vai de domingo a sábado e contém hoje", () => {
    const hoje = hojeBR();
    const { from, to } = rangeFromPeriodo("semana");
    expect(new Date(`${from}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(new Date(`${to}T00:00:00Z`).getUTCDay()).toBe(6);
    expect(from <= hoje && hoje <= to).toBe(true);
  });

  it("Mês começa no dia 1 e termina no último dia do mês corrente", () => {
    const hoje = hojeBR();
    const { from, to } = rangeFromPeriodo("mes");
    expect(from).toBe(`${hoje.slice(0, 7)}-01`);
    expect(to.slice(0, 7)).toBe(hoje.slice(0, 7));
    // O dia seguinte ao fim já pertence ao mês que vem.
    expect(addDias(to, 1).slice(0, 7)).not.toBe(hoje.slice(0, 7));
  });

  it("nenhum botão devolve intervalo invertido", () => {
    for (const p of ["hoje", "ontem", "semana", "mes"] as const) {
      const { from, to } = rangeFromPeriodo(p);
      expect(from <= to).toBe(true);
    }
  });
});
