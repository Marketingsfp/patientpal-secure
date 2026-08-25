import { describe, expect, it } from "bun:test";
import {
  categoriaEhSemCobranca,
  categoriaExigeAutorizacao,
  categoriaZeraRepasse,
  classificarLiberacao,
  classificarForma,
  ehPagoNoSistemaAnterior,
  formaCasaComFiltro,
  partesDoPagamentoMisto,
  filtroFormaPostgrest,
} from "./formas-pagamento";

describe("classificarLiberacao", () => {
  it("separa as três situações em que o paciente não paga", () => {
    // "CORTESIA" é a categoria real cadastrada em fin_categorias.
    expect(classificarLiberacao("CORTESIA")).toBe("cortesia");
    expect(classificarLiberacao("ISENTO")).toBe("cortesia");
    expect(classificarLiberacao("ISENÇÃO SOCIAL")).toBe("cortesia");
    expect(classificarLiberacao("SEM COBRANÇA")).toBe("cortesia");
    expect(classificarLiberacao("RETORNO")).toBe("retorno");
    expect(classificarLiberacao("RETORNO DE CONSULTA")).toBe("retorno");
    expect(classificarLiberacao("GRATUIDADE")).toBe("convenio");
    expect(classificarLiberacao("EXAME GRATUITO")).toBe("convenio");
  });

  it("nome ambíguo cai no caso mais restritivo", () => {
    // Pedir autorização a mais é barato; pagar repasse indevido, não.
    expect(classificarLiberacao("CORTESIA / GRATUIDADE")).toBe("cortesia");
  });

  it("não confunde categoria de convênio nem movimento bancário com liberação", () => {
    // Estas são cobranças normais: quem concede gratuidade pelo convênio é a
    // regra do Cartão Benefícios, não o nome da categoria. Se caíssem aqui, o
    // atendimento de convênio sairia zerado por engano.
    expect(classificarLiberacao("CONVENIOS")).toBe(null);
    expect(classificarLiberacao("EXAME CARTAO CONSULTA")).toBe(null);
    expect(classificarLiberacao("PARTICULAR")).toBe(null);
    expect(classificarLiberacao("MENSALIDADE CARTAO CONSULTA")).toBe(null);
    // "RETORNO DE CHEQUE" tem valor real: se caísse aqui, seria zerado.
    expect(classificarLiberacao("RETORNO DE CHEQUE")).toBe(null);
    expect(classificarLiberacao("ESTORNO")).toBe(null);
    expect(classificarLiberacao(null)).toBe(null);
    expect(classificarLiberacao("")).toBe(null);
  });
});

describe("categoriaEhSemCobranca", () => {
  it("as três liberações zeram o total do paciente", () => {
    expect(categoriaEhSemCobranca("RETORNO DE CONSULTA")).toBe(true);
    expect(categoriaEhSemCobranca("CORTESIA")).toBe(true);
    expect(categoriaEhSemCobranca("GRATUIDADE")).toBe(true);
  });

  it("cobrança normal continua cobrando", () => {
    expect(categoriaEhSemCobranca("PARTICULAR")).toBe(false);
    expect(categoriaEhSemCobranca("CONVENIOS")).toBe(false);
    expect(categoriaEhSemCobranca(null)).toBe(false);
  });
});

describe("categoriaExigeAutorizacao", () => {
  it("exige justificativa e supervisor só na cortesia manual", () => {
    expect(categoriaExigeAutorizacao("CORTESIA")).toBe(true);
    expect(categoriaExigeAutorizacao("ISENÇÃO SOCIAL")).toBe(true);
    expect(categoriaExigeAutorizacao("SEM COBRANÇA")).toBe(true);
  });

  it("libera retorno e gratuidade de convênio sem autorização", () => {
    // Retorno é direito do paciente e gratuidade é cobertura do plano: parar a
    // recepção para chamar um supervisor nesses dois é o defeito.
    expect(categoriaExigeAutorizacao("RETORNO")).toBe(false);
    expect(categoriaExigeAutorizacao("RETORNO DE CONSULTA")).toBe(false);
    expect(categoriaExigeAutorizacao("GRATUIDADE")).toBe(false);
  });

  it("não pede autorização em categoria que cobra normalmente", () => {
    expect(categoriaExigeAutorizacao("PARTICULAR")).toBe(false);
    expect(categoriaExigeAutorizacao(null)).toBe(false);
  });
});

describe("categoriaZeraRepasse", () => {
  it("retorno e cortesia não remuneram ninguém", () => {
    // No retorno o médico já recebeu na consulta de origem; na cortesia não
    // entrou dinheiro de ninguém.
    expect(categoriaZeraRepasse("RETORNO DE CONSULTA")).toBe(true);
    expect(categoriaZeraRepasse("CORTESIA")).toBe(true);
    expect(categoriaZeraRepasse("ISENTO")).toBe(true);
  });

  it("gratuidade de convênio mantém o repasse do prestador", () => {
    // Quem remunera o atendimento é a mensalidade do cartão do paciente, então
    // clínica e prestador continuam recebendo pelo valor de tabela.
    expect(categoriaZeraRepasse("GRATUIDADE")).toBe(false);
    expect(categoriaZeraRepasse("EXAME GRATUITO")).toBe(false);
  });

  it("cobrança normal não é assunto desta regra", () => {
    expect(categoriaZeraRepasse("PARTICULAR")).toBe(false);
    expect(categoriaZeraRepasse(null)).toBe(false);
  });
});

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
    expect(classificarForma("DINHEIRO CX 20")).toBe("dinheiro");
    expect(classificarForma("DINHEIRO F2")).toBe("dinheiro");
    expect(classificarForma("CAIXA 10")).toBe("dinheiro");
    expect(classificarForma("INTERNET BANKING")).toBe("transferencia");
    expect(classificarForma("DEPOSITO - BRADESCO")).toBe("transferencia");
    expect(classificarForma("\tDINHEIRO CX15")).toBe("dinheiro");
  });

  it("todo cartão importado vai para a linha do sistema antigo", () => {
    // O sistema antigo gravava a BANDEIRA no lugar do tipo, e a data da
    // PARCELA no lugar da data da venda — há parcelas até dezembro/2026. Se
    // essas linhas entrassem no Cartão de Crédito, o relatório do dia somaria
    // dinheiro que não passou na maquininha naquele dia.
    for (const f of ["MAESTRO", "MASTER", "VISA", "ELO", "AMERICAN", "VISA ELECTRON"]) {
      expect(classificarForma(f)).toBe("legado_cartao");
    }
    // 27 mil linhas antigas gravadas só como "Cartão", sem bandeira e sem tipo.
    expect(classificarForma("Cartão")).toBe("legado_cartao");
  });

  it("nunca mistura débito com crédito", () => {
    expect(classificarForma("Cartão de Débito")).toBe("debito");
    expect(classificarForma("CARTÃO CRÉDITO")).toBe("credito");
    expect(classificarForma("cartao debito")).toBe("debito");
    // O tipo escrito por extenso vence a bandeira citada junto.
    expect(classificarForma("CARTAO CREDITO VISA")).toBe("credito");
    expect(classificarForma("CARTAO DEBITO MAESTRO")).toBe("debito");
  });

  it("pagamento feito no sistema anterior tem balde próprio", () => {
    // O paciente pagou adiantado na Clínica Total e só agora fez o
    // atendimento. Não é importação (aquilo é `legado_cartao`): é digitado
    // hoje, pela recepção, e não pode ser somado a nenhuma forma que a gaveta
    // de hoje precise conferir.
    expect(classificarForma("pago_sistema_anterior")).toBe("pago_sistema_anterior");
    expect(classificarForma("PAGO NO SISTEMA ANTERIOR")).toBe("pago_sistema_anterior");
    expect(classificarForma("Pago no sistema antigo")).toBe("pago_sistema_anterior");
    expect(classificarForma("CLINICA TOTAL")).toBe("pago_sistema_anterior");
    expect(ehPagoNoSistemaAnterior("pago_sistema_anterior")).toBe(true);
    expect(ehPagoNoSistemaAnterior("dinheiro")).toBe(false);
    expect(ehPagoNoSistemaAnterior(null)).toBe(false);
  });

  it("o texto do sistema anterior vence a forma citada dentro dele", () => {
    // Um lançamento avulso digitado como "PAGO NO SISTEMA ANTERIOR (DINHEIRO)"
    // cairia em `dinheiro` e voltaria a ser cobrado na conferência da gaveta —
    // exatamente a sobra falsa que esta forma existe para evitar.
    expect(classificarForma("PAGO NO SISTEMA ANTERIOR (DINHEIRO)")).toBe("pago_sistema_anterior");
    expect(classificarForma("SISTEMA ANTERIOR - CARTAO VISA")).toBe("pago_sistema_anterior");
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
    expect(formaCasaComFiltro("cartao_credito", "credito")).toBe(true);
    expect(formaCasaComFiltro("cartao_credito", "debito")).toBe(false);
    expect(formaCasaComFiltro("cartao_debito", "debito")).toBe(true);
    expect(formaCasaComFiltro("cartao_debito", "credito")).toBe(false);
  });

  it("o cartão importado não entra em Débito nem em Crédito", () => {
    // É o que faz a linha do dia fechar com a maquininha.
    for (const f of ["MASTER", "VISA", "MAESTRO", "Cartão"]) {
      expect(formaCasaComFiltro(f, "credito")).toBe(false);
      expect(formaCasaComFiltro(f, "debito")).toBe(false);
      expect(formaCasaComFiltro(f, "legado")).toBe(true);
    }
    expect(formaCasaComFiltro("cartao_credito", "legado")).toBe(false);
  });

  it("agrupa todos os cartões só na opção 'Cartão (qualquer)'", () => {
    for (const f of ["MAESTRO", "MASTER", "Cartão", "cartao_debito", "cartao_credito"]) {
      expect(formaCasaComFiltro(f, "cartao")).toBe(true);
    }
    expect(formaCasaComFiltro("dinheiro", "cartao")).toBe(false);
  });

  it("o pagamento do sistema anterior não se mistura a nenhuma forma da gaveta", () => {
    const f = "pago_sistema_anterior";
    for (const filtro of ["dinheiro", "pix", "debito", "credito", "cartao", "legado"] as const) {
      expect(formaCasaComFiltro(f, filtro)).toBe(false);
    }
    expect(formaCasaComFiltro(f, "pago_anterior")).toBe(true);
    expect(formaCasaComFiltro("dinheiro", "pago_anterior")).toBe(false);
    const expr = filtroFormaPostgrest("pago_anterior", false) ?? "";
    expect(expr).toContain("pago_sistema_anterior%");
  });

  it("o recorte enviado ao banco busca cada bandeira só no filtro que a usa", () => {
    const legado = filtroFormaPostgrest("legado", false) ?? "";
    expect(legado).toContain("master%");
    expect(legado).toContain("visa%");
    expect(legado).toContain("maestro%");
    // Crédito e Débito não podem mais arrastar as dezenas de milhares de
    // linhas herdadas só para descartá-las no cliente.
    const credito = filtroFormaPostgrest("credito", false) ?? "";
    expect(credito).not.toContain("master%");
    expect(credito).not.toContain("visa%");
    const debito = filtroFormaPostgrest("debito", true) ?? "";
    expect(debito).not.toContain("maestro%");
    expect(debito).toContain("%debito%");
    expect(debito).toContain("forma_pagamento.eq.misto");
    expect(filtroFormaPostgrest("todos", true)).toBeNull();
  });
});
