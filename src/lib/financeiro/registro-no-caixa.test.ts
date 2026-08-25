import { describe, expect, it } from "bun:test";
import { deveRegistrarNoCaixa, type EntradaRegistroNoCaixa } from "./registro-no-caixa";

const base: EntradaRegistroNoCaixa = {
  temOperador: true,
  valorPrincipal: 130,
  formaPagamento: "dinheiro",
  temAgendamento: true,
  ehPagoSistemaAnterior: false,
  recebidoAntes: false,
};

describe("deveRegistrarNoCaixa", () => {
  it("cobrança normal do dia entra na gaveta", () => {
    expect(deveRegistrarNoCaixa(base)).toBe(true);
  });

  it("guia retroativa com pagamento AGORA entra na gaveta de hoje", () => {
    // Caso PEDRO JOSE DE ALMEIDA: atendimento de 19/08 faturado em 25/08, com
    // o paciente pagando no balcão hoje. O dinheiro está mesmo nesta gaveta.
    expect(deveRegistrarNoCaixa({ ...base, recebidoAntes: false })).toBe(true);
  });

  it("guia retroativa JÁ PAGA antes não toca na gaveta", () => {
    // A blindagem: sem isto, o valor viraria sobra fantasma no fechamento de
    // hoje — dinheiro que a atendente nunca acharia para conferir no cupom.
    expect(deveRegistrarNoCaixa({ ...base, recebidoAntes: true })).toBe(false);
  });

  it("pago no sistema anterior não toca na gaveta", () => {
    expect(
      deveRegistrarNoCaixa({
        ...base,
        ehPagoSistemaAnterior: true,
        formaPagamento: "pago_sistema_anterior",
      }),
    ).toBe(false);
  });

  it("já pago antes vence qualquer valor e qualquer forma", () => {
    // Nenhuma combinação de valor/forma/agendamento pode reabrir a gaveta
    // depois que o operador disse que o dinheiro entrou em outro dia.
    for (const forma of ["dinheiro", "pix", "cartao_credito", "convenio_gratuidade", null]) {
      for (const valor of [0, 9.99, 5000]) {
        expect(
          deveRegistrarNoCaixa({
            ...base,
            recebidoAntes: true,
            formaPagamento: forma,
            valorPrincipal: valor,
          }),
        ).toBe(false);
      }
    }
  });

  it("sem operador não registra, mesmo em cobrança normal", () => {
    expect(deveRegistrarNoCaixa({ ...base, temOperador: false })).toBe(false);
  });

  it("mantém a linha-sombra de R$ 0,00 da agenda e da gratuidade", () => {
    // Retorno/gratuidade: o movimento zerado é o que faz o atendimento
    // aparecer como liberado no caixa. Não pode sumir.
    expect(deveRegistrarNoCaixa({ ...base, valorPrincipal: 0, temAgendamento: true })).toBe(true);
    expect(
      deveRegistrarNoCaixa({
        ...base,
        valorPrincipal: 0,
        temAgendamento: false,
        formaPagamento: "convenio_gratuidade",
      }),
    ).toBe(true);
  });

  it("lançamento avulso de R$ 0,00 sem agendamento não cria movimento", () => {
    expect(
      deveRegistrarNoCaixa({
        ...base,
        valorPrincipal: 0,
        temAgendamento: false,
        formaPagamento: "dinheiro",
      }),
    ).toBe(false);
  });
});
