import { describe, expect, it } from "bun:test";
import {
  limitesDoMes,
  resumirContratos,
  resumirMensalidades,
  type ContratoIndicadorRow,
  type MensalidadeIndicadorRow,
} from "./indicadores";

/**
 * Estes números vão para o topo do Painel Executivo e são lidos pela gestão
 * como "quanto o Cartão fatura" e "quanto está inadimplente". Um erro aqui não
 * derruba a tela — ele publica um valor errado com cara de certo, que é pior.
 */

const HOJE = "2026-08-28";

/** Data ISO N dias antes de HOJE, para escrever os casos por dias de atraso. */
function diasAtras(n: number): string {
  const d = new Date(HOJE + "T00:00:00");
  d.setDate(d.getDate() - n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const contrato = (p: Partial<ContratoIndicadorRow>): ContratoIndicadorRow => ({
  status: "ativo",
  valor_mensal: 100,
  data_inicio: "2020-01-01",
  ...p,
});

const parcela = (p: Partial<MensalidadeIndicadorRow>): MensalidadeIndicadorRow => ({
  status: "aberto",
  valor: 100,
  valor_pago: null,
  vencimento: "2026-08-10",
  ...p,
});

describe("limitesDoMes", () => {
  it("devolve o primeiro e o último dia do mês", () => {
    expect(limitesDoMes("2026-08-28")).toEqual({
      ini: "2026-08-01",
      fim: "2026-08-31",
      hojeIso: "2026-08-28",
    });
  });

  it("acerta o mês de 30 dias", () => {
    expect(limitesDoMes("2026-04-15").fim).toBe("2026-04-30");
  });

  it("acerta fevereiro em ano bissexto e em ano comum", () => {
    expect(limitesDoMes("2028-02-01").fim).toBe("2028-02-29");
    expect(limitesDoMes("2026-02-01").fim).toBe("2026-02-28");
  });

  it("não escorrega um dia no fim do mês (o bug clássico de fuso)", () => {
    expect(limitesDoMes("2026-12-31")).toEqual({
      ini: "2026-12-01",
      fim: "2026-12-31",
      hojeIso: "2026-12-31",
    });
  });
});

describe("resumirContratos", () => {
  it("conta ativos e soma a receita prevista", () => {
    const r = resumirContratos(
      [
        contrato({ valor_mensal: 49.9 }),
        contrato({ valor_mensal: 79.9 }),
        contrato({ status: "cancelado", valor_mensal: 100 }),
      ],
      "2026-08-01",
    );
    expect(r.ativos).toBe(2);
    expect(r.receitaPrevista).toBeCloseTo(129.8, 2);
  });

  it("cancelado, inativo e encerrado contam como fora de uso", () => {
    const r = resumirContratos(
      [
        contrato({ status: "cancelado" }),
        contrato({ status: "inativo" }),
        contrato({ status: "encerrado" }),
        contrato({ status: "ATIVO" }),
      ],
      "2026-08-01",
    );
    expect(r.inativos).toBe(3);
    expect(r.ativos).toBe(1);
  });

  it("contrato cancelado não entra na receita prevista", () => {
    const r = resumirContratos(
      [contrato({ status: "cancelado", valor_mensal: 500 })],
      "2026-08-01",
    );
    expect(r.receitaPrevista).toBe(0);
  });

  it("novas adesões são as que começam a valer dentro do mês", () => {
    const r = resumirContratos(
      [
        contrato({ data_inicio: "2026-08-01", valor_mensal: 60 }),
        contrato({ data_inicio: "2026-08-27", valor_mensal: 40 }),
        contrato({ data_inicio: "2026-07-31", valor_mensal: 999 }),
      ],
      "2026-08-01",
    );
    expect(r.novos).toBe(2);
    expect(r.novosValor).toBeCloseTo(100, 2);
  });

  it("ticket médio é a receita prevista dividida pelos contratos ativos", () => {
    const r = resumirContratos(
      [contrato({ valor_mensal: 50 }), contrato({ valor_mensal: 100 })],
      "2026-08-01",
    );
    expect(r.ticketMedio).toBeCloseTo(75, 2);
  });

  it("ticket médio é zero sem contrato ativo, e não NaN", () => {
    const r = resumirContratos([contrato({ status: "cancelado" })], "2026-08-01");
    expect(r.ticketMedio).toBe(0);
  });

  it("valor nulo no banco não vira NaN", () => {
    const r = resumirContratos([contrato({ valor_mensal: null })], "2026-08-01");
    expect(r.receitaPrevista).toBe(0);
    expect(r.ticketMedio).toBe(0);
  });
});

describe("resumirMensalidades", () => {
  it("separa paga, a vencer e atrasada pela régua dos 5 dias", () => {
    const r = resumirMensalidades(
      [
        parcela({ status: "pago", valor: 100, valor_pago: 110 }),
        parcela({ vencimento: diasAtras(0) }), // vence hoje
        parcela({ vencimento: diasAtras(5) }), // último dia da tolerância
        parcela({ vencimento: diasAtras(6) }), // primeiro dia de atraso
      ],
      HOJE,
    );
    expect(r.pagas).toBe(1);
    expect(r.aVencer).toBe(2);
    expect(r.atrasadas).toBe(1);
  });

  it("usa o valor efetivamente pago quando houve multa e juros", () => {
    const r = resumirMensalidades(
      [parcela({ status: "pago", valor: 100, valor_pago: 113.4 })],
      HOJE,
    );
    expect(r.pagasValor).toBeCloseTo(113.4, 2);
  });

  it("cai no valor da parcela quando o pago não foi registrado", () => {
    const r = resumirMensalidades(
      [parcela({ status: "pago", valor: 100, valor_pago: null })],
      HOJE,
    );
    expect(r.pagasValor).toBeCloseTo(100, 2);
  });

  it("parcela cancelada fica fora dos dois lados da conta", () => {
    const r = resumirMensalidades(
      [parcela({ status: "cancelado", valor: 999, vencimento: diasAtras(60) })],
      HOJE,
    );
    expect(r.faturado).toBe(0);
    expect(r.faturadoValor).toBe(0);
    expect(r.inadimplenciaPct).toBe(0);
  });

  it("inadimplência é o valor atrasado sobre o faturado do mês", () => {
    const r = resumirMensalidades(
      [
        parcela({ status: "pago", valor: 100, valor_pago: 100 }),
        parcela({ vencimento: diasAtras(1), valor: 100 }),
        parcela({ vencimento: diasAtras(30), valor: 200 }),
      ],
      HOJE,
    );
    expect(r.atrasadasValor).toBeCloseTo(200, 2);
    expect(r.faturadoValor).toBeCloseTo(400, 2);
    expect(r.inadimplenciaPct).toBeCloseTo(50, 2);
  });

  it("mês sem nenhuma parcela devolve 0%, e não NaN", () => {
    const r = resumirMensalidades([], HOJE);
    expect(r.inadimplenciaPct).toBe(0);
    expect(Number.isNaN(r.inadimplenciaPct)).toBe(false);
  });

  it("parcela dentro da tolerância não conta como inadimplência", () => {
    const r = resumirMensalidades([parcela({ vencimento: diasAtras(5), valor: 100 })], HOJE);
    expect(r.atrasadas).toBe(0);
    expect(r.inadimplenciaPct).toBe(0);
  });

  it("a partir do 6º dia a mesma parcela vira inadimplência de 100%", () => {
    const r = resumirMensalidades([parcela({ vencimento: diasAtras(6), valor: 100 })], HOJE);
    expect(r.atrasadas).toBe(1);
    expect(r.inadimplenciaPct).toBeCloseTo(100, 2);
  });
});
