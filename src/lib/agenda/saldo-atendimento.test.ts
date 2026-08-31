import { describe, expect, it } from "bun:test";
import { aceitaNovoRecebimento, calcularSaldoAtendimento, rotuloSaldo } from "./saldo-atendimento";

describe("calcularSaldoAtendimento", () => {
  it("é o cenário da coordenadora: R$ 100,00 com R$ 50,00 de entrada", () => {
    const s = calcularSaldoAtendimento(100, 50)!;
    expect(s.total).toBe(100);
    expect(s.pago).toBe(50);
    expect(s.restante).toBe(50);
    expect(s.parcial).toBe(true);
    expect(s.quitado).toBe(false);
  });

  it("fica quitado quando o saldo é pago na semana seguinte", () => {
    const s = calcularSaldoAtendimento(100, 100)!;
    expect(s.restante).toBe(0);
    expect(s.parcial).toBe(false);
    expect(s.quitado).toBe(true);
  });

  it("não trata como parcial o atendimento que ainda não recebeu nada", () => {
    // Sem nenhum recebimento não existe "parcialmente pago" — é só pendente.
    const s = calcularSaldoAtendimento(100, 0)!;
    expect(s.parcial).toBe(false);
    expect(s.restante).toBe(100);
  });

  it("ignora sobra de centavo de arredondamento", () => {
    // Rateio de R$ 100,00 em 3 partes deixa resíduo; isso não é saldo devedor.
    const s = calcularSaldoAtendimento(100, 99.999)!;
    expect(s.quitado).toBe(true);
    expect(s.restante).toBe(0);
  });

  it("nunca devolve saldo negativo quando se recebe a mais", () => {
    const s = calcularSaldoAtendimento(100, 120)!;
    expect(s.restante).toBe(0);
    expect(s.quitado).toBe(true);
  });

  it("devolve null para atendimento sem total combinado", () => {
    // Comportamento antigo preservado: quem não tem valor_cobranca continua
    // sendo considerado pago pela simples existência do lançamento.
    expect(calcularSaldoAtendimento(null, 50)).toBeNull();
    expect(calcularSaldoAtendimento(0, 0)).toBeNull();
    expect(calcularSaldoAtendimento(undefined, 0)).toBeNull();
  });

  it("arredonda o saldo para centavos", () => {
    const s = calcularSaldoAtendimento(100, 33.333)!;
    expect(s.restante).toBe(66.67);
  });
});

describe("rotuloSaldo", () => {
  it("mostra o que falta em reais", () => {
    const s = calcularSaldoAtendimento(100, 50)!;
    // Intl separa "R$" do número com espaço não separável, então a asserção
    // olha as duas partes em vez de comparar a string inteira.
    expect(rotuloSaldo(s).startsWith("Falta R$")).toBe(true);
    expect(rotuloSaldo(s)).toContain("50,00");
  });
});

describe("aceitaNovoRecebimento", () => {
  it("aceita o primeiro recebimento de um atendimento comum", () => {
    expect(aceitaNovoRecebimento(null, 0)).toBe(true);
    expect(aceitaNovoRecebimento(400, 0)).toBe(true);
  });

  it("recusa o segundo recebimento quando não há total combinado", () => {
    // Atendimento comum: existir lançamento significa estar pago.
    expect(aceitaNovoRecebimento(null, 130)).toBe(false);
  });

  it("aceita a quitação do saldo de um pagamento parcial", () => {
    // R$ 400,00 combinados, R$ 200,00 recebidos: os outros R$ 200,00 têm de
    // conseguir entrar — era exatamente isso que a trava antiga barrava.
    expect(aceitaNovoRecebimento(400, 200)).toBe(true);
  });

  it("recusa um terceiro recebimento depois de quitado", () => {
    expect(aceitaNovoRecebimento(400, 400)).toBe(false);
    expect(aceitaNovoRecebimento(400, 450)).toBe(false);
  });

  it("trata sobra de arredondamento como quitado", () => {
    expect(aceitaNovoRecebimento(100, 99.999)).toBe(false);
  });
});
