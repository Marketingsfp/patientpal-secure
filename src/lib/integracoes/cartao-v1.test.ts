import { describe, expect, it } from "bun:test";
import {
  resumirContrato,
  serializarParcela,
  hojeSaoPauloISO,
  type ParcelaBruta,
} from "./cartao-v1.server";

const HOJE = "2026-08-30";

/** Parcela mínima; cada teste sobrescreve só o que interessa. */
function parcela(over: Partial<ParcelaBruta>): ParcelaBruta {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    contrato_id: "00000000-0000-0000-0000-0000000000c1",
    numero_parcela: 1,
    vencimento: "2026-08-10",
    valor: 49.9,
    taxa_adesao: 0,
    status: "pendente",
    pago_em: null,
    valor_pago: null,
    forma_pagamento: null,
    multa: 0,
    juros: 0,
    updated_at: "2026-08-10T00:00:00-03:00",
    ...over,
  };
}

describe("serializarParcela — normalização de status legado", () => {
  it("trata 'aberto' exatamente como 'pendente'", () => {
    // São as 30 parcelas legadas de produção. Se saíssem como situação
    // diferente, o consumidor externo classificaria errado quem está em dia.
    const pendente = serializarParcela(parcela({ status: "pendente" }), HOJE);
    const aberto = serializarParcela(parcela({ status: "aberto" }), HOJE);
    expect(aberto.situacao).toBe(pendente.situacao);
    expect(aberto.situacao).toBe("inadimplente");
  });

  it("não trata 'atrasado', 'vencida' e 'vencido' como quitados", () => {
    for (const status of ["atrasado", "vencida", "vencido"]) {
      expect(serializarParcela(parcela({ status }), HOJE).situacao).not.toBe("paga");
    }
  });

  it("devolve o status cru junto, para auditoria", () => {
    expect(serializarParcela(parcela({ status: "aberto" }), HOJE).status).toBe("aberto");
  });
});

describe("serializarParcela — dias de atraso", () => {
  it("conta os dias corridos desde o vencimento", () => {
    expect(serializarParcela(parcela({ vencimento: "2026-08-10" }), HOJE).dias_atraso).toBe(20);
  });

  it("é zero quando a parcela ainda não venceu", () => {
    expect(serializarParcela(parcela({ vencimento: "2026-09-10" }), HOJE).dias_atraso).toBe(0);
  });

  it("é zero em parcela paga ou cancelada, mesmo vencida", () => {
    expect(
      serializarParcela(parcela({ status: "pago", pago_em: "2026-08-09" }), HOJE).dias_atraso,
    ).toBe(0);
    expect(serializarParcela(parcela({ status: "cancelado" }), HOJE).dias_atraso).toBe(0);
  });
});

describe("serializarParcela — a régua de 5 dias", () => {
  it("no 5º dia de atraso ainda é 'a_vencer' (dentro da tolerância)", () => {
    const m = serializarParcela(parcela({ vencimento: "2026-08-25" }), HOJE);
    expect(m.dias_atraso).toBe(5);
    expect(m.situacao).toBe("a_vencer");
  });

  it("no 6º dia vira 'inadimplente'", () => {
    const m = serializarParcela(parcela({ vencimento: "2026-08-24" }), HOJE);
    expect(m.dias_atraso).toBe(6);
    expect(m.situacao).toBe("inadimplente");
  });
});

describe("resumirContrato", () => {
  it("em dia quando nada venceu", () => {
    const r = resumirContrato(
      [
        parcela({ status: "pago", vencimento: "2026-07-10", pago_em: "2026-07-10" }),
        parcela({ vencimento: "2026-09-10" }),
      ],
      HOJE,
    );
    expect(r.situacao_financeira).toBe("em_dia");
    expect(r.resumo_financeiro.dias_carencia_restantes).toBeNull();
  });

  it("em carência — vencida há 3 dias, com 2 dias de tolerância restantes", () => {
    const r = resumirContrato([parcela({ vencimento: "2026-08-27" })], HOJE);
    expect(r.situacao_financeira).toBe("em_carencia");
    expect(r.resumo_financeiro.dias_carencia_restantes).toBe(2);
    expect(r.resumo_financeiro.total_em_carencia).toBe(49.9);
    // Carência NÃO é dívida vencida: não pode entrar no total em aberto.
    expect(r.resumo_financeiro.total_em_aberto_vencido).toBe(0);
  });

  it("inadimplente vence carência quando há as duas situações", () => {
    const r = resumirContrato(
      [
        parcela({ vencimento: "2026-08-27" }), // carência
        parcela({ numero_parcela: 2, vencimento: "2026-07-10" }), // estourada
      ],
      HOJE,
    );
    expect(r.situacao_financeira).toBe("inadimplente");
    expect(r.resumo_financeiro.dias_carencia_restantes).toBeNull();
    expect(r.resumo_financeiro.total_em_aberto_vencido).toBe(49.9);
  });

  it("os quatro baldes somam o total, sem sobra nem repetição", () => {
    const parcelas = [
      parcela({ numero_parcela: 1, status: "pago", pago_em: "2026-05-10" }),
      parcela({ numero_parcela: 2, status: "cancelado" }),
      parcela({ numero_parcela: 3, status: "aberto", vencimento: "2026-07-10" }),
      parcela({ numero_parcela: 4, vencimento: "2026-08-27" }),
      parcela({ numero_parcela: 5, vencimento: "2026-09-10" }),
    ];
    const { resumo_financeiro: r } = resumirContrato(parcelas, HOJE);
    expect(
      r.parcelas_pagas + r.parcelas_canceladas + r.parcelas_a_vencer + r.parcelas_inadimplentes,
    ).toBe(r.parcelas_total);
    expect(r.parcelas_total).toBe(5);
    expect(r.parcelas_pagas).toBe(1);
    expect(r.parcelas_canceladas).toBe(1);
    expect(r.parcelas_inadimplentes).toBe(1);
    expect(r.parcelas_a_vencer).toBe(2); // a de setembro e a em carência
  });

  it("contrato sem nenhuma parcela sai em dia, não inadimplente", () => {
    const r = resumirContrato([], HOJE);
    expect(r.situacao_financeira).toBe("em_dia");
    expect(r.resumo_financeiro.parcelas_total).toBe(0);
  });

  it("publica a tolerância usada, para o outro lado não chutar", () => {
    expect(resumirContrato([], HOJE).resumo_financeiro.dias_tolerancia).toBe(5);
  });
});

describe("hojeSaoPauloISO", () => {
  it("devolve AAAA-MM-DD", () => {
    expect(hojeSaoPauloISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("usa São Paulo, não UTC — às 23h de Brasília ainda é o mesmo dia", () => {
    // O Worker roda em UTC: sem o fuso, das 21h em diante a data pularia para
    // o dia seguinte e adiantaria em 1 dia toda a contagem de atraso.
    const brasilia = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(hojeSaoPauloISO()).toBe(brasilia);
  });
});
