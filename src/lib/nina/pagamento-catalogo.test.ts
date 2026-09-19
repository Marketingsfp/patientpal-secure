import { describe, expect, it } from "bun:test";
import {
  formasPagamentoNina,
  rotularValoresCartao,
  rotuloPagamentoNina,
} from "./pagamento-catalogo";
import { formaPagamentoSchema } from "./catalogo";
import { resumoDePrecos } from "./knowledge-contract";
import {
  montarResultadoCatalogo,
  profissionalParaRegistro,
  type ServicoPublicado,
} from "./catalogo-conhecimento";
import { extrairEvidencia } from "./confidence/evidencia-extrator";
import { verificarFormaPagamento } from "./confidence/pagamento-declarado";

describe("Pix usa o preço do cartão na Nina", () => {
  it.each(["Cartão", "CARTAO", "cartão", "Pix/cartão"])(
    "normaliza %s sem duplicar Pix",
    (forma) => {
      const resultado = rotuloPagamentoNina(forma);
      expect(resultado).toBe("Pix/cartão");
      expect(rotuloPagamentoNina(resultado)).toBe(resultado);
    },
  );

  it("mantém dinheiro separado e preserva valores, condições e observações", () => {
    const formas = [
      { forma: "Dinheiro", valor: 51 },
      { forma: "Cartão", valor: 60, condicao: "Consulta", observacao: "Cartão em 3x" },
    ];
    expect(formasPagamentoNina(formas)).toEqual([formas[0], { ...formas[1], forma: "Pix/cartão" }]);
    expect(formas[1]?.forma).toBe("Cartão");
    expect(formaPagamentoSchema.parse(formas[1])).toEqual({
      forma: "Pix/cartão",
      valor: 60,
      condicao: "Consulta",
      observacao: "Cartão em 3x",
    });
  });

  it("mantém o mesmo rótulo ao repetir a atualização de descrições", () => {
    const texto = "Dinheiro: R$ 51,00 | Cartão: R$ 60,00. Parcelamento no cartão em 3x.";
    const atualizado = rotularValoresCartao(texto);
    expect(atualizado).toBe(
      "Dinheiro: R$ 51,00 | Pix/cartão: R$ 60,00. Parcelamento no cartão em 3x.",
    );
    expect(rotularValoresCartao(atualizado)).toBe(atualizado);
    expect(rotularValoresCartao("PIX / Cartão: R$ 60,00")).toBe("Pix/cartão: R$ 60,00");
    expect(rotularValoresCartao("Documento necessário — cartão: SUS")).toBe(
      "Documento necessário — cartão: SUS",
    );
  });

  it("resumos mantêm os meios explícitos mesmo com preços iguais ou dinheiro ausente", () => {
    expect(resumoDePrecos(60, 60)).toBe("Dinheiro: R$ 60,00 / Pix/cartão: R$ 60,00");
    expect(resumoDePrecos(null, 60)).toBe("Pix/cartão: R$ 60,00");
    expect(resumoDePrecos(51, null)).toBe("Dinheiro: R$ 51,00");
    expect(resumoDePrecos(null, null)).toBeNull();
  });

  it("consultas preservam preços por condição e não inventam valores ausentes", () => {
    const formas = [
      { forma: "Cartão", valor: 145, condicao: "Consulta Cardiologia" },
      { forma: "Cartão", valor: 180, condicao: "Consulta Clínica Geral" },
      { forma: "Cartão", valor: null, condicao: "Retorno" },
    ];
    const registro = profissionalParaRegistro(
      {
        id: "prof",
        nome: "Dra. Ana",
        especialidades: [{ nome: "Cardiologia" }],
        atende_consultorio: null,
        formas_pagamento: formas,
        convenios: [],
        horarios: [],
        tipo_atendimento: null,
        observacao_publica: null,
        aviso_dia: null,
        aviso_valido_de: null,
        aviso_valido_ate: null,
      },
      "2026-09-19",
    );
    expect(registro.extras?.formas_pagamento).toEqual(
      formas.map((f) => ({ ...f, forma: "Pix/cartão" })),
    );
    expect(registro.observacoes).toContain("Retorno — Pix/cartão: valor não informado");
    expect(registro.preco_dinheiro).toBeNull();
  });

  it("um registro antigo com cartão entrega Pix/cartão ao modelo, sem usar o preço do dinheiro", () => {
    const servico: ServicoPublicado = {
      id: "ecg",
      nome: "Eletrocardiograma",
      valor: null,
      valor_observacao: null,
      descricao_publica: "Dinheiro: R$ 51,00 | Cartão: R$ 60,00",
      preparo: null,
      restricoes: null,
      executantes: [],
      formas_pagamento: [
        { forma: "Dinheiro", valor: 51 },
        { forma: "Cartão", valor: 60 },
      ],
    };
    const dados = montarResultadoCatalogo({
      servicos: [servico],
      profissionais: [],
      hojeISO: "2026-09-19",
    });
    expect(dados.price).toBe("Dinheiro: R$ 51,00 / Pix/cartão: R$ 60,00");
    expect(dados.records[0]?.observacoes).toContain("Pix/cartão: R$ 60,00");
    expect(dados.records[0]?.extras?.formas_pagamento).toEqual([
      { forma: "Dinheiro", valor: 51 },
      { forma: "Pix/cartão", valor: 60 },
    ]);
    expect(dados.instrucao).toContain("na mesma frase ou linha");
    const evidencia = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      args: { termo: "eletrocardiograma" },
      dados,
    });
    for (const forma of ["pix", "cartao"]) {
      expect(
        verificarFormaPagamento({
          forma,
          negacao: false,
          chave: { procedimento: "Eletrocardiograma" },
          fatos: evidencia.fatos,
          consultas: [evidencia.consulta],
        }).situacao,
      ).toBe("confirmado");
    }
  });
});
