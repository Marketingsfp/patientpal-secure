import { describe, expect, it } from "bun:test";
import {
  calcularParcelasQueFaltam,
  vencimentoDaProximaParcela,
  type ParcelasQueFaltamEntrada,
} from "./parcelas-que-faltam";

const base = (p: Partial<ParcelasQueFaltamEntrada>): ParcelasQueFaltamEntrada => ({
  dataInicio: "2026-01-01",
  dataFim: "2026-12-31",
  diaVencimento: 10,
  hojeIso: "2026-10-01",
  existentes: [],
  ...p,
});

describe("calcularParcelasQueFaltam", () => {
  it("contrato importado sem parcela: gera do mês corrente até o fim da vigência, nunca mês passado", () => {
    expect(calcularParcelasQueFaltam(base({}))).toEqual({
      tipo: "ok",
      vencimentos: ["2026-10-10", "2026-11-10", "2026-12-10"],
    });
  });

  it("pula mês que já tem mensalidade, mas não o que só tem parcela cancelada ou taxa", () => {
    const r = calcularParcelasQueFaltam(
      base({
        existentes: [
          { numero_parcela: 2, vencimento: "2026-10-10", status: "pendente" },
          { numero_parcela: 3, vencimento: "2026-11-10", status: "cancelado" },
          { numero_parcela: 0, vencimento: "2026-12-01", status: "pago" },
        ],
      }),
    );
    expect(r).toEqual({ tipo: "ok", vencimentos: ["2026-11-10", "2026-12-10"] });
  });

  it("dia de vencimento já passou no mês corrente: vence hoje, não nasce atrasada", () => {
    const r = calcularParcelasQueFaltam(base({ hojeIso: "2026-10-20" }));
    expect(r).toEqual({ tipo: "ok", vencimentos: ["2026-10-20", "2026-11-10", "2026-12-10"] });
  });

  it("vigência encerrada não gera nada", () => {
    expect(calcularParcelasQueFaltam(base({ dataFim: "2025-12-31" }))).toEqual({
      tipo: "vigencia_encerrada",
      dataFim: "2025-12-31",
    });
  });

  it("vigência de um ano a partir do dia 1º não gera o 13º mês", () => {
    const r = calcularParcelasQueFaltam(
      base({ dataInicio: "2026-09-01", dataFim: "2027-09-01", diaVencimento: 10 }),
    );
    expect(r.tipo).toBe("ok");
    if (r.tipo === "ok") {
      expect(r.vencimentos[0]).toBe("2026-10-10");
      expect(r.vencimentos.at(-1)).toBe("2027-08-10");
      expect(r.vencimentos).toHaveLength(11);
    }
  });

  it("sem data de fim usa um ano depois do início", () => {
    const r = calcularParcelasQueFaltam(base({ dataInicio: "2026-07-15", dataFim: null }));
    expect(r.tipo === "ok" && r.vencimentos.at(-1)).toBe("2027-07-10");
  });

  it("dia 31 em fevereiro cai no último dia do mês", () => {
    const r = calcularParcelasQueFaltam(
      base({
        dataInicio: "2027-01-01",
        dataFim: "2027-03-15",
        diaVencimento: 31,
        hojeIso: "2027-02-01",
      }),
    );
    expect(r).toEqual({ tipo: "ok", vencimentos: ["2027-02-28"] });
  });

  it("nada faltando quando todos os meses já têm parcela", () => {
    const r = calcularParcelasQueFaltam(
      base({
        existentes: ["10", "11", "12"].map((m, i) => ({
          numero_parcela: i + 1,
          vencimento: `2026-${m}-10`,
          status: "pendente",
        })),
      }),
    );
    expect(r).toEqual({ tipo: "nada_faltando" });
  });
});

describe("vencimentoDaProximaParcela", () => {
  const p = (numero: number, vencimento: string, status = "pendente") => ({
    numero_parcela: numero,
    vencimento,
    status,
  });

  it("mês seguinte à última mensalidade, no dia do contrato", () => {
    expect(
      vencimentoDaProximaParcela(
        [p(1, "2026-09-14", "pago"), p(2, "2026-10-10")],
        10,
        "2026-10-01",
      ),
    ).toBe("2026-11-10");
  });

  it("adicionar várias seguidas não repete a data", () => {
    const lista = [p(1, "2026-10-10")];
    const segunda = vencimentoDaProximaParcela(lista, 10, "2026-10-01");
    const terceira = vencimentoDaProximaParcela([...lista, p(2, segunda)], 10, "2026-10-01");
    expect([segunda, terceira]).toEqual(["2026-11-10", "2026-12-10"]);
  });

  it("ignora cancelada e taxa de adesão", () => {
    expect(
      vencimentoDaProximaParcela(
        [p(1, "2026-10-10"), p(2, "2027-03-10", "cancelado"), p(0, "2027-05-01")],
        10,
        "2026-10-01",
      ),
    ).toBe("2026-11-10");
  });

  it("sem mensalidade: mês corrente, ou hoje se o dia já passou", () => {
    expect(vencimentoDaProximaParcela([], 10, "2026-10-01")).toBe("2026-10-10");
    expect(vencimentoDaProximaParcela([], 10, "2026-10-20")).toBe("2026-10-20");
  });

  it("virada de ano e dia 31", () => {
    expect(vencimentoDaProximaParcela([p(1, "2026-12-31")], 31, "2026-12-01")).toBe("2027-01-31");
    expect(vencimentoDaProximaParcela([p(1, "2027-01-31")], 31, "2027-01-01")).toBe("2027-02-28");
  });
});
