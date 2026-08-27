import { describe, expect, it } from "bun:test";
import { COR_FORMA, receitaPorForma, totalDasFatias } from "./receita-por-forma";
import { ORDEM_FORMAS } from "./formas-pagamento";
import { repartirPorForma } from "./rateio-receita";

const valorDe = (fatias: ReturnType<typeof receitaPorForma>, forma: string) =>
  fatias.find((f) => f.forma === forma)?.valor;

describe("receitaPorForma", () => {
  it("soma cada forma e devolve as quatro principais mesmo zeradas", () => {
    const fatias = receitaPorForma([
      { formas: [{ forma: "dinheiro", valor: 100 }] },
      { formas: [{ forma: "dinheiro", valor: 50 }] },
      { formas: [{ forma: "pix", valor: 200 }] },
    ]);
    expect(valorDe(fatias, "dinheiro")).toBe(150);
    expect(valorDe(fatias, "pix")).toBe(200);
    expect(valorDe(fatias, "debito")).toBe(0);
    expect(valorDe(fatias, "credito")).toBe(0);
    expect(fatias).toHaveLength(4);
  });

  it("mantém débito e crédito separados", () => {
    const fatias = receitaPorForma([
      { formas: [{ forma: "debito", valor: 70 }] },
      { formas: [{ forma: "credito", valor: 30 }] },
    ]);
    expect(valorDe(fatias, "debito")).toBe(70);
    expect(valorDe(fatias, "credito")).toBe(30);
  });

  it("mostra os baldes de exceção só quando têm valor", () => {
    const semExcecao = receitaPorForma([{ formas: [{ forma: "pix", valor: 10 }] }]);
    expect(semExcecao.map((f) => f.forma)).toEqual(["dinheiro", "pix", "debito", "credito"]);

    const comExcecao = receitaPorForma([
      { formas: [{ forma: "pix", valor: 10 }] },
      { formas: [{ forma: "sem_informacao", valor: 5 }] },
    ]);
    expect(valorDe(comExcecao, "sem_informacao")).toBe(5);
  });

  it("o detalhamento fecha com o total, sem esconder centavo nenhum", () => {
    const linhas = [
      { formas: [{ forma: "dinheiro" as const, valor: 33.33 }] },
      { formas: [{ forma: "legado_cartao" as const, valor: 1163 }] },
      { formas: [{ forma: "convenio" as const, valor: 0 }] },
      { formas: [{ forma: "credito" as const, valor: 66.67 }] },
    ];
    expect(totalDasFatias(receitaPorForma(linhas))).toBe(1263);
  });

  it("percentual é a fatia do total e some quando não houve receita", () => {
    const fatias = receitaPorForma([
      { formas: [{ forma: "dinheiro", valor: 250 }] },
      { formas: [{ forma: "pix", valor: 750 }] },
    ]);
    expect(fatias.find((f) => f.forma === "dinheiro")?.percentual).toBe(25);
    expect(fatias.find((f) => f.forma === "pix")?.percentual).toBe(75);
    expect(receitaPorForma([]).every((f) => f.percentual === 0)).toBe(true);
  });

  it("segue a ordem do Fechamento de Caixa", () => {
    const fatias = receitaPorForma([
      { formas: [{ forma: "sem_informacao", valor: 1 }] },
      { formas: [{ forma: "credito", valor: 1 }] },
      { formas: [{ forma: "dinheiro", valor: 1 }] },
    ]);
    const posicao = fatias.map((f) => ORDEM_FORMAS.indexOf(f.forma));
    expect(posicao).toEqual([...posicao].sort((a, b) => a - b));
  });

  it("toda forma tem cor definida", () => {
    for (const forma of ORDEM_FORMAS) expect(COR_FORMA[forma]).toBeTruthy();
  });
});

describe("repartirPorForma", () => {
  it("pagamento simples vira uma parte só, com a receita inteira", () => {
    expect(repartirPorForma(150, 150, "cartao_credito")).toEqual([
      { forma: "credito", valor: 150 },
    ]);
  });

  it("texto sem forma cai em 'sem informação' e não some da conta", () => {
    expect(repartirPorForma(80, 80, null)).toEqual([{ forma: "sem_informacao", valor: 80 }]);
  });

  it("misto é decomposto pela composição gravada", () => {
    const partes = repartirPorForma(120, 120, "misto", null, {
      partes: [
        { forma: "dinheiro", valor: 50 },
        { forma: "cartao_debito", valor: 70 },
      ],
    });
    expect(partes).toEqual([
      { forma: "dinheiro", valor: 50 },
      { forma: "debito", valor: 70 },
    ]);
  });

  it("partes da mesma forma são fundidas numa linha só", () => {
    const partes = repartirPorForma(80, 80, "misto", null, {
      partes: [
        { forma: "dinheiro", valor: 20 },
        { forma: "pix", valor: 30 },
        { forma: "dinheiro", valor: 30 },
      ],
    });
    expect(partes).toEqual([
      { forma: "dinheiro", valor: 50 },
      { forma: "pix", valor: 30 },
    ]);
  });

  it("quando a receita do rateio difere do valor pago, as partes entram como proporção", () => {
    // Pagou R$ 100 (60 em dinheiro, 40 em PIX), mas o rateio considera o valor
    // de tabela de R$ 150: a proporção é mantida e a soma bate com a receita.
    const partes = repartirPorForma(150, 100, "misto", null, {
      partes: [
        { forma: "dinheiro", valor: 60 },
        { forma: "pix", valor: 40 },
      ],
    });
    expect(partes).toEqual([
      { forma: "dinheiro", valor: 90 },
      { forma: "pix", valor: 60 },
    ]);
  });

  it("a última parte absorve o centavo do arredondamento", () => {
    const partes = repartirPorForma(100, 3, "misto", null, {
      partes: [
        { forma: "dinheiro", valor: 1 },
        { forma: "pix", valor: 1 },
        { forma: "cartao_debito", valor: 1 },
      ],
    });
    expect(partes.reduce((s, p) => s + p.valor, 0)).toBe(100);
  });

  it("composição que não fecha com o valor pago é descartada — a linha volta a ser Misto", () => {
    const partes = repartirPorForma(120, 120, "misto", null, {
      partes: [
        { forma: "dinheiro", valor: 50 },
        { forma: "cartao_debito", valor: 10 },
      ],
    });
    expect(partes).toEqual([{ forma: "misto", valor: 120 }]);
  });

  it("lançamento antigo sem composição é decomposto pela observação", () => {
    const partes = repartirPorForma(
      120,
      120,
      "misto",
      "PAGAMENTO MISTO: DINHEIRO R$ 50,00; CARTAO DEBITO R$ 70,00",
    );
    expect(partes).toEqual([
      { forma: "dinheiro", valor: 50 },
      { forma: "debito", valor: 70 },
    ]);
  });

  it("cortesia e gratuidade entram com R$ 0,00 sem quebrar o detalhamento", () => {
    expect(repartirPorForma(0, 0, "convenio_gratuidade")).toEqual([
      { forma: "convenio", valor: 0 },
    ]);
  });
});
