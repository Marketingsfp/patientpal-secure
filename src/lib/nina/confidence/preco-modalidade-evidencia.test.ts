import { describe, expect, it } from "bun:test";
import { extrairEvidencia } from "./evidencia-extrator";
import type { ContextoConfianca } from "./types";

const evidencia = extrairEvidencia({
  ferramenta: "consultar_cadastro",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados: {
    records: [
      {
        id: "profissional-teste",
        medico: "Carlos Silva",
        procedimento: "Consulta — CARDIOLOGIA, CLÍNICO GERAL, CARDIOLOGIA INFANTIL",
        preco_dinheiro: 120,
        preco_cartao: 145,
        extras: {
          formas_pagamento: [
            { forma: "Dinheiro", valor: 120, condicao: "Consulta Cardiologia" },
            { forma: "Cartão", valor: 145, condicao: "Consulta Cardiologia" },
            { forma: "Dinheiro", valor: 160, condicao: "Consulta Cardiologia Infantil" },
            { forma: "Cartão", valor: 190, condicao: "Consulta Cardiologia Infantil" },
          ],
        },
      },
    ],
  },
});
const ctx: ContextoConfianca = {
  requestedAction: null,
  intent: "informacao",
  toolResults: [],
  retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
  fatos: evidencia.fatos,
  consultas: [evidencia.consulta],
  businessContext: {
    ambiente: "homologacao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
};

describe("preço pertence à modalidade declarada no próprio registro", () => {
  it("não gera alias agregado que amplie os preços gerais para a modalidade infantil", () => {
    const precos = evidencia.fatos.filter((f) => f.campo === "preco");
    expect(precos).toHaveLength(4);
    expect(precos.map((f) => [f.chave?.procedimento, f.valor])).toEqual([
      ["Consulta Cardiologia", "120"],
      ["Consulta Cardiologia", "145"],
      ["Consulta Cardiologia Infantil", "160"],
      ["Consulta Cardiologia Infantil", "190"],
    ]);
  });
});
