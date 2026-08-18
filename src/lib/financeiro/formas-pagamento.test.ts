import { describe, expect, it } from "bun:test";
import {
  classificarForma,
  formaCasaComFiltro,
  partesDoPagamentoMisto,
  filtroFormaPostgrest,
} from "./formas-pagamento";

describe("classificarForma", () => {
  it("classifica o que o sistema atual grava", () => {
    expect(classificarForma("dinheiro")).toBe("dinheiro");
    expect(classificarForma("pix")).toBe("pix");
    expect(classificarForma("cartao_debito")).toBe("debito");
    expect(classificarForma("cartao_credito")).toBe("credito");
    expect(classificarForma("misto")).toBe("misto");
    expect(classificarForma("convenio_gratuidade")).toBe("convenio");
  });

  it("classifica os textos herdados do sistema antigo", () => {
    // Valores reais encontrados em fin_lancamentos.forma_pagamento.
    expect(classificarForma("MAESTRO")).toBe("debito");
    expect(classificarForma("MASTER")).toBe("credito");
    expect(classificarForma("VISA")).toBe("credito");
    expect(classificarForma("ELO")).toBe("credito");
    expect(classificarForma("AMERICAN")).toBe("credito");
    expect(classificarForma("DINHEIRO CX 20")).toBe("dinheiro");
    expect(classificarForma("DINHEIRO F2")).toBe("dinheiro");
    expect(classificarForma("CAIXA 10")).toBe("dinheiro");
    expect(classificarForma("INTERNET BANKING")).toBe("transferencia");
    expect(classificarForma("DEPOSITO - BRADESCO")).toBe("transferencia");
    expect(classificarForma("\tDINHEIRO CX15")).toBe("dinheiro");
  });

  it("nunca mistura débito com crédito", () => {
    // "VISA ELECTRON" tem a palavra VISA (bandeira de crédito) mas é débito:
    // a bandeira de débito é avaliada primeiro.
    expect(classificarForma("VISA ELECTRON")).toBe("debito");
    expect(classificarForma("Cartão de Débito")).toBe("debito");
    expect(classificarForma("CARTÃO CRÉDITO")).toBe("credito");
    expect(classificarForma("cartao debito")).toBe("debito");
  });

  it("não chuta o tipo de um cartão sem bandeira", () => {
    // 27 mil linhas antigas gravadas só como "Cartão": somá-las ao débito ou
    // ao crédito falsearia a conferência com a maquininha.
    expect(classificarForma("Cartão")).toBe("cartao_indefinido");
  });

  it("trata ausência de forma como sem informação", () => {
    expect(classificarForma(null)).toBe("sem_informacao");
    expect(classificarForma("")).toBe("sem_informacao");
    expect(classificarForma("   ")).toBe("sem_informacao");
    expect(classificarForma("SPLIT SAUDE SERVICE")).toBe("outros");
  });
});

describe("partesDoPagamentoMisto", () => {
  it("usa a composição estruturada quando existe", () => {
    const comp = {
      origem: "lancamento_dialog",
      partes: [
        { forma: "cartao_credito", valor: 182 },
        { forma: "cartao_debito", valor: 35 },
      ],
    };
    expect(partesDoPagamentoMisto("misto", null, comp)).toEqual([
      { forma: "credito", valor: 182 },
      { forma: "debito", valor: 35 },
    ]);
  });

  it("lê as observações quando não há composição — regressão da letra R", () => {
    // A regex antiga recusava qualquer rótulo com a letra "R", então DINHEIRO
    // e CARTAO DEBITO eram descartados e o lançamento inteiro ficava fora do
    // débito e do crédito.
    const obs = "PAGAMENTO MISTO: DINHEIRO R$ 50,00; CARTAO DEBITO R$ 70,00";
    expect(partesDoPagamentoMisto("misto", obs)).toEqual([
      { forma: "dinheiro", valor: 50 },
      { forma: "debito", valor: 70 },
    ]);
  });

  it("ignora a bandeira e as parcelas escritas depois do valor", () => {
    const obs =
      "PAGAMENTO MISTO: CARTAO CREDITO R$ 200,00 (MASTERCARD 3X); CARTAO CREDITO R$ 175,00 (MASTERCARD 2X)";
    expect(partesDoPagamentoMisto("misto", obs)).toEqual([
      { forma: "credito", valor: 200 },
      { forma: "credito", valor: 175 },
    ]);
  });

  it("não decompõe o que não é misto", () => {
    expect(partesDoPagamentoMisto("dinheiro", "PAGAMENTO MISTO: PIX R$ 10,00")).toEqual([]);
  });
});

describe("filtros de forma", () => {
  it("mantém débito e crédito isolados", () => {
    expect(formaCasaComFiltro("MASTER", "credito")).toBe(true);
    expect(formaCasaComFiltro("MASTER", "debito")).toBe(false);
    expect(formaCasaComFiltro("MAESTRO", "debito")).toBe(true);
    expect(formaCasaComFiltro("MAESTRO", "credito")).toBe(false);
    expect(formaCasaComFiltro("cartao_debito", "credito")).toBe(false);
  });

  it("agrupa os dois cartões só na opção 'Cartão (qualquer)'", () => {
    for (const f of ["MAESTRO", "MASTER", "Cartão"]) {
      expect(formaCasaComFiltro(f, "cartao")).toBe(true);
    }
    expect(formaCasaComFiltro("dinheiro", "cartao")).toBe(false);
  });

  it("o recorte enviado ao banco cobre as bandeiras antigas", () => {
    const credito = filtroFormaPostgrest("credito", false) ?? "";
    expect(credito).toContain("master%");
    expect(credito).toContain("visa%");
    const debito = filtroFormaPostgrest("debito", true) ?? "";
    expect(debito).toContain("maestro%");
    expect(debito).toContain("forma_pagamento.eq.misto");
    expect(filtroFormaPostgrest("todos", true)).toBeNull();
  });
});
