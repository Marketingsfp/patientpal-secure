/**
 * FASE 1 (MOTOR DE CONFIABILIDADE) — o contexto avaliado precisa conter os
 * dados reais do turno, e cada dado precisa chegar ao validador correspondente.
 */
import { describe, expect, it } from "bun:test";
import { detectarConflitosEntreFatos } from "./evidencia";
import type { FatoRecuperado } from "./evidencia";

const fato = (f: Partial<FatoRecuperado>): FatoRecuperado => ({
  consulta: "buscar_conhecimento",
  capacidade: "searchKnowledgeBase",
  entidade: "procedimento",
  campo: "preco",
  valor: "250,00",
  fonte: "catalogo_publicado",
  ...f,
});

describe("conflitos entre fatos do mesmo campo e escopo", () => {
  it("dois preços diferentes para o mesmo procedimento são conflito", () => {
    const conflitos = detectarConflitosEntreFatos([
      fato({ valor: "250,00", registro: "a", chave: { procedimento: "Ultrassom" } }),
      fato({ valor: "310,00", registro: "b", chave: { procedimento: "Ultrassom" } }),
    ]);
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]!.valores).toHaveLength(2);
  });

  it("procedimentos diferentes não são conflito", () => {
    expect(
      detectarConflitosEntreFatos([
        fato({ valor: "250,00", chave: { procedimento: "Ultrassom" } }),
        fato({ valor: "310,00", chave: { procedimento: "Ressonância" } }),
      ]),
    ).toHaveLength(0);
  });

  it("lista de dias de atendimento não vira conflito", () => {
    expect(
      detectarConflitosEntreFatos([
        fato({ entidade: "escala", campo: "dia_atendimento", valor: "segunda" }),
        fato({ entidade: "escala", campo: "dia_atendimento", valor: "quarta" }),
      ]),
    ).toHaveLength(0);
  });
});
