import { describe, expect, it } from "bun:test";
import { agruparPagamentosPorAtendimento, resumirPagamentos } from "./modalidade-atendimento";

describe("resumirPagamentos", () => {
  it("atendimento sem lançamento confirmado fica 'Sem pagamento' nas duas colunas", () => {
    expect(resumirPagamentos([])).toEqual({ modalidade: "sem_pagamento", forma: "Sem pagamento" });
  });

  it("lançamento sem convênio é Particular, com a forma pelo nome do caixa", () => {
    expect(
      resumirPagamentos([{ forma_pagamento: "cartao_debito", convenio_modalidade: null }]),
    ).toEqual({ modalidade: "particular", forma: "Cartão de Débito" });
  });

  it("cobrança do cartão pago em dinheiro é Cartão Benefícios + Dinheiro, não Particular", () => {
    expect(
      resumirPagamentos([{ forma_pagamento: "dinheiro", convenio_modalidade: "cartao_consulta" }]),
    ).toEqual({ modalidade: "cartao", forma: "Dinheiro" });
  });

  it("o cartão vence quando só um dos lançamentos tem a modalidade", () => {
    expect(
      resumirPagamentos([
        { forma_pagamento: "pix", convenio_modalidade: null },
        { forma_pagamento: "pix", convenio_modalidade: "cartao_consulta" },
      ]).modalidade,
    ).toBe("cartao");
  });

  it("outra modalidade de convênio preenchida vira Convênio", () => {
    expect(
      resumirPagamentos([{ forma_pagamento: "pix", convenio_modalidade: "outro_plano" }])
        .modalidade,
    ).toBe("convenio");
  });

  it("duas formas diferentes, ou o lançamento 'misto', viram Misto", () => {
    expect(
      resumirPagamentos([
        { forma_pagamento: "dinheiro", convenio_modalidade: null },
        { forma_pagamento: "pix", convenio_modalidade: null },
      ]).forma,
    ).toBe("Misto");
    expect(resumirPagamentos([{ forma_pagamento: "misto", convenio_modalidade: null }]).forma).toBe(
      "Misto",
    );
  });

  it("dois lançamentos na mesma forma continuam com o nome da forma", () => {
    expect(
      resumirPagamentos([
        { forma_pagamento: "dinheiro", convenio_modalidade: null },
        { forma_pagamento: "DINHEIRO CX4", convenio_modalidade: null },
      ]).forma,
    ).toBe("Dinheiro");
  });
});

describe("agruparPagamentosPorAtendimento", () => {
  it("agrupa por atendimento e descarta lançamento sem vínculo", () => {
    const mapa = agruparPagamentosPorAtendimento([
      { agendamento_id: "a1", forma_pagamento: "pix", convenio_modalidade: null },
      { agendamento_id: "a1", forma_pagamento: "dinheiro", convenio_modalidade: null },
      { agendamento_id: null, forma_pagamento: "pix", convenio_modalidade: null },
    ]);
    expect(mapa.size).toBe(1);
    expect(mapa.get("a1")).toHaveLength(2);
  });
});
