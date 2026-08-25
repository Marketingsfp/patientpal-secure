import { describe, expect, it } from "bun:test";
import { planoDeMovimento, type EntradaRegistroNoCaixa } from "./registro-no-caixa";

const base: EntradaRegistroNoCaixa = {
  temOperador: true,
  tipoLancamento: "receita",
  valorPrincipal: 130,
  formaPagamento: "dinheiro",
  temAgendamento: true,
  ehPagoSistemaAnterior: false,
  recebidoAntes: false,
};

describe("planoDeMovimento", () => {
  it("cobrança normal do dia vira recebimento na gaveta", () => {
    expect(planoDeMovimento(base)).toEqual({
      registra: true,
      tipo: "recebimento",
      forcarSessaoHoje: false,
    });
  });

  it("guia retroativa com pagamento AGORA entra como recebimento de verdade", () => {
    // Caso PEDRO JOSE DE ALMEIDA: atendimento de 19/08 faturado em 25/08 com o
    // paciente pagando no balcão. O dinheiro está mesmo nesta gaveta.
    // `forcarSessaoHoje: false` deixa a RPC mandar para o caixa de 19/08 se ele
    // ainda estiver aberto.
    expect(planoDeMovimento({ ...base, recebidoAntes: false })).toEqual({
      registra: true,
      tipo: "recebimento",
      forcarSessaoHoje: false,
    });
  });

  it("guia retroativa JÁ PAGA vira 'registro' no caixa de hoje", () => {
    // A linha aparece no extrato do dia da digitação (auditoria) e pesa zero
    // no dinheiro esperado da gaveta — o comportamento do sistema antigo.
    expect(planoDeMovimento({ ...base, recebidoAntes: true })).toEqual({
      registra: true,
      tipo: "registro",
      forcarSessaoHoje: true,
    });
  });

  it("já pago antes vence qualquer valor e qualquer forma", () => {
    for (const forma of ["dinheiro", "pix", "cartao_credito", "convenio_gratuidade", null]) {
      for (const valor of [0, 9.99, 5000]) {
        const p = planoDeMovimento({
          ...base,
          recebidoAntes: true,
          formaPagamento: forma,
          valorPrincipal: valor,
        });
        expect(p).toEqual({ registra: true, tipo: "registro", forcarSessaoHoje: true });
      }
    }
  });

  it("pago no sistema anterior não gera movimento nenhum", () => {
    expect(
      planoDeMovimento({
        ...base,
        ehPagoSistemaAnterior: true,
        formaPagamento: "pago_sistema_anterior",
      }),
    ).toEqual({ registra: false });
  });

  it("sem operador não registra, mesmo em cobrança normal", () => {
    expect(planoDeMovimento({ ...base, temOperador: false })).toEqual({ registra: false });
  });

  it("despesa vira movimento de despesa", () => {
    expect(planoDeMovimento({ ...base, tipoLancamento: "despesa" })).toEqual({
      registra: true,
      tipo: "despesa",
      forcarSessaoHoje: false,
    });
  });

  it("mantém a linha-sombra de R$ 0,00 da agenda e da gratuidade", () => {
    // Retorno/gratuidade: o movimento zerado é o que faz o atendimento
    // aparecer como liberado no caixa. Não pode sumir.
    const daAgenda = planoDeMovimento({ ...base, valorPrincipal: 0, temAgendamento: true });
    expect(daAgenda).toEqual({ registra: true, tipo: "recebimento", forcarSessaoHoje: false });
    const gratuidade = planoDeMovimento({
      ...base,
      valorPrincipal: 0,
      temAgendamento: false,
      formaPagamento: "convenio_gratuidade",
    });
    expect(gratuidade).toEqual({ registra: true, tipo: "recebimento", forcarSessaoHoje: false });
  });

  it("lançamento avulso de R$ 0,00 sem agendamento não cria movimento", () => {
    expect(
      planoDeMovimento({
        ...base,
        valorPrincipal: 0,
        temAgendamento: false,
        formaPagamento: "dinheiro",
      }),
    ).toEqual({ registra: false });
  });
});
