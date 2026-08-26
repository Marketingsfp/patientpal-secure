import { describe, expect, it } from "bun:test";
import {
  ehLancamentoRetroativo,
  mapaDaGaveta,
  totaisRetroativos,
  diaBR,
  type GavetaDoLancamento,
} from "./retroativos";

/** 25/08/2026 às 14:30 em Brasília (UTC−3). */
const DIGITADO_25 = "2026-08-25T17:30:00.000Z";
/** 19/08/2026 às 08:18 em Brasília. */
const DIGITADO_19 = "2026-08-19T11:18:00.000Z";

const gaveta = (dia: string, fechadaEm: string | null = null): GavetaDoLancamento => ({
  dia,
  fechadaEm,
});

describe("ehLancamentoRetroativo", () => {
  it("lançamento do próprio dia não é retroativo", () => {
    expect(
      ehLancamentoRetroativo(
        { data: "2026-08-25", created_at: DIGITADO_25 },
        gaveta("2026-08-25", "2026-08-25T21:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("lançamento manual do próprio dia sem movimento de caixa não é retroativo", () => {
    // Despesa paga pelo banco: nunca passa pela gaveta, mas é do dia.
    expect(ehLancamentoRetroativo({ data: "2026-08-25", created_at: DIGITADO_25 }, null)).toBe(
      false,
    );
  });

  it("guia de 19/08 faturada em 25/08 com o caixa de 19/08 já fechado é retroativa", () => {
    // O dinheiro caiu na gaveta de 25/08 — não é dinheiro do caixa de 19/08.
    expect(
      ehLancamentoRetroativo(
        { data: "2026-08-19", created_at: DIGITADO_25 },
        gaveta("2026-08-25", "2026-08-25T21:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("movimento empurrado para dentro de uma sessão JÁ FECHADA é retroativo", () => {
    // Caso real de 13/08/2026: caixa fechado ao meio-dia e um recebimento de
    // R$ 110,00 digitado em 19/08 foi parar dentro dele. A data da sessão é a
    // "certa", mas o cupom impresso daquele dia não tem esse valor.
    expect(
      ehLancamentoRetroativo(
        { data: "2026-08-13", created_at: DIGITADO_19 },
        gaveta("2026-08-13", "2026-08-13T15:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("sessão do dia ainda ABERTA conta como dinheiro do dia, mesmo digitado depois", () => {
    // Caixa de 22/08 que a recepção deixou aberto: o cupom dele ainda não foi
    // impresso e vai sair com esse valor dentro.
    expect(
      ehLancamentoRetroativo({ data: "2026-08-22", created_at: DIGITADO_25 }, gaveta("2026-08-22")),
    ).toBe(false);
  });

  it("digitado antes do fechamento da sessão daquele dia conta como dinheiro do dia", () => {
    // Sessão de 18/08 fechada só em 19/08 às 12:43; a digitação das 12:29 de
    // 19/08 entrou antes e saiu no cupom.
    expect(
      ehLancamentoRetroativo(
        { data: "2026-08-18", created_at: "2026-08-19T15:29:00.000Z" },
        gaveta("2026-08-18", "2026-08-19T15:43:00.000Z"),
      ),
    ).toBe(false);
  });

  it("guia retroativa já quitada antes (sem gaveta) é retroativa", () => {
    expect(ehLancamentoRetroativo({ data: "2026-08-19", created_at: DIGITADO_25 }, null)).toBe(
      true,
    );
  });

  it("sangria e suprimento nunca são retroativos", () => {
    expect(
      ehLancamentoRetroativo(
        { data: "2026-08-19", created_at: DIGITADO_25, origem: "caixa" },
        null,
      ),
    ).toBe(false);
  });

  it("sem created_at não classifica (linha antiga) — fica no caixa do dia", () => {
    expect(ehLancamentoRetroativo({ data: "2026-08-19", created_at: null }, null)).toBe(false);
  });

  it("depois das 21h de Brasília o dia da digitação ainda é o dia local", () => {
    // 25/08 às 22:00 em Brasília = 26/08T01:00Z. Competência 25/08 não é
    // retroativa: foi digitada no mesmo dia da clínica.
    expect(
      ehLancamentoRetroativo({ data: "2026-08-25", created_at: "2026-08-26T01:00:00.000Z" }, null),
    ).toBe(false);
  });
});

describe("mapaDaGaveta", () => {
  const sessoes = [
    { id: "s13", aberto_em: "2026-08-13T11:00:00.000Z", fechado_em: "2026-08-13T15:00:00.000Z" },
    { id: "s22", aberto_em: "2026-08-22T11:00:00.000Z", fechado_em: null },
  ];

  it("indexa recebimento e despesa pela sessão em que caíram", () => {
    const m = mapaDaGaveta(
      [
        { lancamento_id: "a", tipo: "recebimento", sessao_id: "s13" },
        { lancamento_id: "b", tipo: "despesa", sessao_id: "s22" },
      ],
      sessoes,
    );
    expect(m.get("a")).toEqual({ dia: "2026-08-13", fechadaEm: "2026-08-13T15:00:00.000Z" });
    expect(m.get("b")).toEqual({ dia: "2026-08-22", fechadaEm: null });
  });

  it("ignora a linha de histórico 'registro' — ela pesa zero na gaveta", () => {
    const m = mapaDaGaveta([{ lancamento_id: "a", tipo: "registro", sessao_id: "s13" }], sessoes);
    expect(m.has("a")).toBe(false);
  });

  it("ignora estorno, movimento sem lançamento e sessão fora do recorte", () => {
    const m = mapaDaGaveta(
      [
        { lancamento_id: "a", tipo: "estorno", sessao_id: "s13" },
        { lancamento_id: null, tipo: "sangria", sessao_id: "s13" },
        { lancamento_id: "c", tipo: "recebimento", sessao_id: "desconhecida" },
      ],
      sessoes,
    );
    expect(m.size).toBe(0);
  });
});

describe("totaisRetroativos", () => {
  it("separa receitas de despesas e lista os dias de competência", () => {
    const t = totaisRetroativos([
      { tipo: "receita", valor: 130, data: "2026-08-19" },
      { tipo: "receita", valor: "70.50", data: "2026-08-20" },
      { tipo: "despesa", valor: 30, data: "2026-08-19" },
    ]);
    expect(t.receitas).toBe(200.5);
    expect(t.despesas).toBe(30);
    expect(t.saldo).toBe(170.5);
    expect(t.quantidade).toBe(3);
    expect(t.dias).toEqual(["2026-08-19", "2026-08-20"]);
  });

  it("lista vazia devolve zeros", () => {
    expect(totaisRetroativos([])).toEqual({
      receitas: 0,
      despesas: 0,
      saldo: 0,
      quantidade: 0,
      dias: [],
    });
  });
});

describe("diaBR", () => {
  it("formata a competência para leitura", () => {
    expect(diaBR("2026-08-19")).toBe("19/08/2026");
    expect(diaBR("")).toBe("");
  });
});
