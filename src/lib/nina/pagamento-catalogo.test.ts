import { describe, expect, it } from "bun:test";
import { formaPagamentoSchema } from "./catalogo";
import { resumoDePrecos } from "./knowledge-contract";
import { montarResultadoCatalogo, type ServicoPublicado } from "./catalogo-conhecimento";
import { sincronizarPrecosPublicados } from "./catalogo-precos-texto";

describe("pagamento preservado como dado; política no system prompt", () => {
  it("não transforma cartão em Pix ao validar um cadastro", () => {
    for (const forma of ["Cartão", "Dinheiro", "Pix", "Pix/cartão"])
      expect(formaPagamentoSchema.parse({ forma, valor: 90 }).forma).toBe(forma);
  });
  it("preserva meios distintos, preços, condições e descrição para o modelo", () => {
    const formas = [
      { forma: "Dinheiro", valor: 80 },
      { forma: "Cartão", valor: 95 },
      { forma: "Pix", valor: 88 },
    ];
    const s = {
      id: "exame",
      nome: "Exame",
      valor: null,
      valor_observacao: null,
      descricao_publica: "Cartão: R$ 95,00",
      preparo: null,
      restricoes: null,
      executantes: [],
      formas_pagamento: formas,
    } satisfies ServicoPublicado;
    const r = montarResultadoCatalogo({ servicos: [s], profissionais: [], hojeISO: "2026-10-04" });
    expect(r.records[0]?.extras?.formas_pagamento).toEqual(formas);
    expect(r.records[0]?.extras?.descricao_publica).toBe(s.descricao_publica);
    expect(r.price).toBe("Dinheiro: R$ 80,00 / Cartão: R$ 95,00");
    expect(r.notes.join(" ")).toContain("Pix: R$ 88,00");
    expect(r.instrucao).not.toMatch(/Pix.cartão|antecipado|desconto em dinheiro/);
  });
  it("resumo do campo cartão não inventa autorização para Pix", () => {
    expect(resumoDePrecos(null, 95)).toBe("Cartão: R$ 95,00");
    expect(resumoDePrecos(80, null)).toBe("Dinheiro: R$ 80,00");
    expect(resumoDePrecos(null, null)).toBeNull();
  });
  it("sincronização editorial altera só o meio solicitado", () => {
    const antes = {
      descricao_publica:
        "EXAME\nEspecialidade: Cardiologia\nProfissional: Ana\nDinheiro: R$ 80,00\nCartão: R$ 95,00\nPix: R$ 88,00",
      formas_pagamento: [
        { forma: "Dinheiro", valor: 80 },
        { forma: "Cartão", valor: 95 },
        { forma: "Pix", valor: 88 },
      ],
    };
    const depois = structuredClone(antes);
    depois.formas_pagamento[1]!.valor = 100;
    sincronizarPrecosPublicados("servico", antes, depois);
    expect(depois.descricao_publica).toContain("Cartão: R$ 100,00");
    expect(depois.descricao_publica).toContain("Pix: R$ 88,00");
    expect(depois.descricao_publica).not.toContain("Pix/cartão");
  });
});
