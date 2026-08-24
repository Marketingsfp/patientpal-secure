import { describe, expect, it } from "bun:test";
import {
  classificarDiferenca,
  saldoDeMovimentos,
  saldoEsperadoGaveta,
  totalConferido,
} from "./fechamento";

describe("totalConferido", () => {
  it("soma todas as formas de pagamento, não só o dinheiro", () => {
    // Cenário real que travou a recepção em 17/08/2026: a gaveta zerada por
    // sangrias, com o dia inteiro recebido em PIX e cartões.
    const conferido = { dinheiro: "0.00", pix: "130.00", debito: "508.00", credito: "767.00" };
    expect(totalConferido(conferido)).toBe(1405);
  });

  it("não confere quando o total é lido apenas do dinheiro em gaveta", () => {
    // Guarda contra a regressão original: comparar só o dinheiro com o saldo do
    // dia acusava falta do valor inteiro.
    const conferido = { dinheiro: "0.00", pix: "130.00", debito: "508.00", credito: "767.00" };
    const saldoDoDia = 1405;
    expect(classificarDiferenca(Number(conferido.dinheiro), saldoDoDia).tipo).toBe("falta");
    expect(classificarDiferenca(totalConferido(conferido), saldoDoDia).tipo).toBe("exato");
  });

  it("trata vazio, nulo e texto não numérico como zero", () => {
    expect(totalConferido({ dinheiro: "", pix: null, debito: undefined, credito: "abc" })).toBe(0);
    expect(totalConferido({})).toBe(0);
  });

  it("aceita número além de texto e mantém duas casas", () => {
    expect(totalConferido({ dinheiro: 10.005, pix: "0.005" })).toBe(10.01);
    expect(totalConferido({ a: "0.10", b: "0.20" })).toBe(0.3);
  });

  it("soma valores negativos, como um estorno que supera os recebimentos", () => {
    expect(totalConferido({ dinheiro: "100.00", pix: "-30.00" })).toBe(70);
  });
});

describe("escopo da conferência x saldo do dia", () => {
  // A grade de conferência cobre recebimento, suprimento, estorno, sangria e
  // despesa. A abertura (troco) não é forma de pagamento e é conferida no
  // quadro da gaveta. Se ela entrasse no saldo do dia, o total das formas nunca
  // fecharia — e o campo do total não é mais editável para compensar na mão.
  const TIPO_SINAL: Record<string, number> = {
    abertura: 1,
    suprimento: 1,
    recebimento: 1,
    sangria: -1,
    despesa: -1,
    estorno: -1,
    fechamento: 0,
    reabertura: 0,
  };
  const saldoDoDia = (movs: Array<{ tipo: string; valor: number }>) =>
    Number(
      movs
        .reduce((acc, m) => (m.tipo === "abertura" ? acc : acc + TIPO_SINAL[m.tipo] * m.valor), 0)
        .toFixed(2),
    );

  it("dia aberto com troco não gera falta fantasma", () => {
    // 11/08/2026 em produção: troco de R$ 110,00 e R$ 90,00 de movimento.
    const movs = [
      { tipo: "abertura", valor: 110 },
      { tipo: "recebimento", valor: 90 },
    ];
    expect(saldoDoDia(movs)).toBe(90);
    expect(classificarDiferenca(totalConferido({ dinheiro: "90.00" }), saldoDoDia(movs)).tipo).toBe(
      "exato",
    );
    // O troco continua conferido no quadro da gaveta, não se perde.
    expect(
      saldoEsperadoGaveta({
        saldoInicial: 110,
        recebimentosDinheiro: 90,
        suprimentos: 0,
        sangrias: 0,
        despesas: 0,
      }),
    ).toBe(200);
  });

  it("sangria entra no saldo do dia e derruba o esperado em espécie", () => {
    const movs = [
      { tipo: "recebimento", valor: 1405 },
      { tipo: "sangria", valor: 1405 },
      { tipo: "fechamento", valor: 999 },
      { tipo: "reabertura", valor: 999 },
    ];
    expect(saldoDoDia(movs)).toBe(0);
  });
});

describe("saldoDeMovimentos", () => {
  it("não conta o troco de abertura como receita do dia", () => {
    // O caso de 11/08/2026: caixa com R$ 10,00 de troco e R$ 90,00 recebidos.
    const movs = [
      { tipo: "abertura", valor: 10 },
      { tipo: "recebimento", valor: 90 },
    ];
    expect(saldoDeMovimentos(movs)).toBe(90);
  });

  it("fechar o próprio caixa e fechar pelo gestor dão o mesmo valor", () => {
    // Guarda contra a regressão original: eram duas contas paralelas e só uma
    // somava a abertura, então o gestor gravava R$ 100,00 num caixa que a
    // operadora fecharia em R$ 90,00 — uma sobra fantasma do tamanho do troco.
    const movsDaSessao = [
      { tipo: "abertura", valor: 10 },
      { tipo: "recebimento", valor: 90 },
    ];
    const movsDoDia = movsDaSessao.filter((m) => m.tipo !== "abertura");
    expect(saldoDeMovimentos(movsDaSessao)).toBe(saldoDeMovimentos(movsDoDia));
  });

  it("soma entradas e subtrai saídas", () => {
    const movs = [
      { tipo: "recebimento", valor: 4064.97 },
      { tipo: "suprimento", valor: 100 },
      { tipo: "sangria", valor: 3650 },
      { tipo: "despesa", valor: 50 },
      { tipo: "estorno", valor: 60 },
    ];
    expect(saldoDeMovimentos(movs)).toBe(404.97);
  });

  it("ignora marcos do caixa que não movem dinheiro", () => {
    const movs = [
      { tipo: "recebimento", valor: 200 },
      { tipo: "fechamento", valor: 200 },
      { tipo: "reabertura", valor: 0 },
    ];
    expect(saldoDeMovimentos(movs)).toBe(200);
  });

  it("trata valor vazio, nulo e tipo desconhecido como zero", () => {
    const movs = [
      { tipo: "recebimento", valor: null },
      { tipo: "recebimento", valor: "abc" },
      { tipo: "recebimento", valor: "110.00" },
      { tipo: "tipo_que_nao_existe", valor: 999 },
    ];
    expect(saldoDeMovimentos(movs)).toBe(110);
  });

  it("não arrasta erro de ponto flutuante", () => {
    const movs = [
      { tipo: "recebimento", valor: 0.1 },
      { tipo: "recebimento", valor: 0.2 },
    ];
    expect(saldoDeMovimentos(movs)).toBe(0.3);
  });
});
