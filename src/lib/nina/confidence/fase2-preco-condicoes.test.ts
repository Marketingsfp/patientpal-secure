/**
 * FASE 2 — NORMALIZAÇÃO E EXTRAÇÃO DAS EVIDÊNCIAS MONETÁRIAS.
 *
 * Dados fictícios. Sem banco, sem rede, sem mensagem real.
 */
import { describe, expect, it } from "bun:test";
import {
  extrairEvidencia,
  precosDoRegistro,
  registrosDoRetorno,
  type RetornoFerramenta,
} from "./evidencia-extrator";

const retorno = (dados: unknown): RetornoFerramenta => ({
  ferramenta: "buscar_conhecimento",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados,
  args: { termo: "x" },
});

const precos = (dados: unknown) =>
  extrairEvidencia(retorno(dados))
    .fatos.filter((f) => f.campo === "preco")
    .map((f) => ({ condicoes: f.chave?.condicoes ?? null, valor: f.valor }));

describe("leitura das referências monetárias do registro", () => {
  it("campos por forma viram condições separadas", () => {
    expect(precosDoRegistro({ preco_dinheiro: 51, preco_cartao: 60 })).toMatchObject([
      { forma: "dinheiro", centavos: 5100 },
      { forma: "cartao", centavos: 6000 },
    ]);
  });

  it("lista formas_pagamento, inclusive dentro de estruturas auxiliares", () => {
    const lista = precosDoRegistro({
      precos: {
        formas_pagamento: [
          { forma: "dinheiro", valor: "R$ 51,00" },
          { forma: "cartao", valor: "60.00", condicao: "3x sem juros" },
        ],
      },
    });
    expect(lista).toMatchObject([
      { forma: "dinheiro", condicao: null, centavos: 5100 },
      { forma: "cartao", condicao: "3x sem juros", centavos: 6000 },
    ]);
  });

  it("mapa forma → valor também é aceito", () => {
    expect(
      precosDoRegistro({ extras: { formas_pagamento: { dinheiro: "51,00", pix: 49 } } }),
    ).toMatchObject([
      { forma: "dinheiro", centavos: 5100 },
      { forma: "pix", centavos: 4900 },
    ]);
  });

  it("normaliza milhar, decimal e qualificadores sem inventar forma", () => {
    const lista = precosDoRegistro({ preco: "a partir de R$ 1.500,00" });
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ forma: null, condicao: "a partir de", centavos: 150000 });
  });

  it("ausência de preço não vira zero", () => {
    expect(precosDoRegistro({ preco_dinheiro: null, preco_cartao: undefined })).toEqual([]);
  });
});

describe("normalização dos formatos de retorno", () => {
  it("`registros` e `records` com o mesmo dado não duplicam", () => {
    const reg = { id: "r1", procedimento: "Eletrocardiograma", preco_dinheiro: 51 };
    expect(registrosDoRetorno({ registros: [reg], records: [{ ...reg }] })).toHaveLength(1);
    expect(precos({ registros: [reg], records: [{ ...reg }] })).toEqual([
      { condicoes: "dinheiro", valor: "51" },
    ]);
  });

  it("formatos equivalentes produzem evidências equivalentes", () => {
    const a = precos({
      records: [
        { id: "r", procedimento: "ECG", preco_dinheiro: "R$ 51,00", preco_cartao: "R$ 60,00" },
      ],
    });
    const b = precos({
      registros: [
        {
          id: "r",
          procedimento: "ECG",
          formas_pagamento: [
            { forma: "dinheiro", valor: "R$ 51,00" },
            { forma: "cartao", valor: "R$ 60,00" },
          ],
        },
      ],
    });
    expect(a.map((p) => p.condicoes)).toEqual(b.map((p) => p.condicoes));
    expect(a.map((p) => p.valor)).toEqual(b.map((p) => p.valor));
  });

  it("o resumo `price` não apaga as condições detalhadas", () => {
    const lista = precos({
      price: "R$ 51,00",
      records: [{ id: "r", procedimento: "ECG", preco_dinheiro: 51, preco_cartao: 60 }],
    });
    expect(lista).toEqual([
      { condicoes: "dinheiro", valor: "51" },
      { condicoes: "cartao", valor: "60" },
    ]);
  });

  it("resumo divergente das condições é preservado e sinalizado como conflito", () => {
    const e = extrairEvidencia(
      retorno({
        price: "R$ 90,00",
        records: [{ id: "r", procedimento: "ECG", preco_dinheiro: 51, preco_cartao: 60 }],
      }),
    );
    expect(e.consulta.motivo).toBe("conflict");
    expect(e.fatos.filter((f) => f.campo === "preco").map((f) => f.valor)).toEqual([
      "51",
      "60",
      "R$ 90,00",
    ]);
  });

  it("sem detalhamento, o resumo vira evidência sem forma suposta", () => {
    const lista = precos({ procedure: "ECG", price: "R$ 51,00" });
    expect(lista).toEqual([{ condicoes: null, valor: "R$ 51,00" }]);
  });

  it("a evidência conserva procedimento, profissional, unidade, registro e versão", () => {
    const [fato] = extrairEvidencia(
      retorno({
        base_version: 6,
        records: [
          {
            id: "r9",
            procedimento: "Eletrocardiograma",
            medico: "Dra. Marina",
            unidade: "Centro",
            preco_cartao: 60,
          },
        ],
      }),
    ).fatos;
    expect(fato).toMatchObject({
      campo: "preco",
      valor: "60",
      registro: "r9",
      versao: "6",
      fonte: "catalogo_publicado",
      chave: {
        procedimento: "Eletrocardiograma",
        medicoNome: "Dra. Marina",
        unidadeId: "Centro",
        condicoes: "cartao",
      },
    });
  });
});
