import { describe, expect, it } from "bun:test";
import type { MapaConvenioPaciente } from "@/lib/convenio/modalidade";
import { agruparPagamentosPorAtendimento, resumirPagamentos } from "./modalidade-atendimento";

const mapa: MapaConvenioPaciente = new Map([
  [
    "pac-cartao",
    {
      contratoId: "c1",
      convenioId: "v1",
      convenioNome: "CARTÃO CONSULTA",
      modalidade: "cartao_consulta",
    },
  ],
]);

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

  it("sem marca no lançamento, o contrato ativo do paciente do atendimento decide (regra do Rateio)", () => {
    const lanc = { forma_pagamento: "dinheiro", convenio_modalidade: null };
    expect(resumirPagamentos([lanc], { mapa, pacienteId: "pac-cartao" }).modalidade).toBe("cartao");
    expect(resumirPagamentos([lanc], { mapa, pacienteId: "outro" }).modalidade).toBe("particular");
  });

  it("o paciente gravado no lançamento vence o do atendimento", () => {
    expect(
      resumirPagamentos(
        [{ forma_pagamento: "pix", convenio_modalidade: null, paciente_id: "outro" }],
        {
          mapa,
          pacienteId: "pac-cartao",
        },
      ).modalidade,
    ).toBe("particular");
  });

  it("lançamento antigo sem marca e sem contrato cai no texto da descrição", () => {
    expect(
      resumirPagamentos([
        {
          forma_pagamento: "pix",
          convenio_modalidade: null,
          descricao: "MARIA — CONSULTA CARTÃO CONSULTA",
        },
      ]).modalidade,
    ).toBe("cartao");
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
