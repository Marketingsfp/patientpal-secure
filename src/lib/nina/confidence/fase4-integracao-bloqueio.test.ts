/**
 * FASE 4 — INTEGRAÇÃO, BLOQUEIO E RASTREABILIDADE.
 *
 * Percorre a cadeia realmente usada pela Nina, apenas em memória:
 *
 *   retorno da ferramenta -> extrairEvidencia -> contexto do turno
 *   -> verificação da RESPOSTA FINAL (texto exato) -> nível/bloqueio
 *
 * Dados fictícios. Sem banco, sem rede, sem modelo, sem mensagem real,
 * sem publicação e sem operação clínica.
 */
import { describe, expect, it } from "bun:test";
import { montarResultadoConhecimento } from "../knowledge-contract";
import { montarResultadoCatalogo } from "../catalogo-conhecimento";
import { extrairEvidencia, type RetornoFerramenta } from "./evidencia-extrator";
import type { FatoRecuperado } from "./evidencia";
import type { ContextoConfianca } from "./types";

type Registro = Record<string, unknown>;

const ECG: Registro = {
  id: "reg-ecg",
  procedimento: "Eletrocardiograma",
  medico: "Dra. Marina",
  preco_dinheiro: 51,
  preco_cartao: 60,
};

function retorno(registros: Registro[]): RetornoFerramenta {
  return {
    ferramenta: "buscar_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados: montarResultadoConhecimento({
      registros,
      base: { versao: 6, arquivo: "catalogo.xlsx" },
    }),
    args: { termo: "eletrocardiograma" },
  };
}

function fatosDe(registros: Registro[]): FatoRecuperado[] {
  return extrairEvidencia(retorno(registros)).fatos;
}

function contexto(
  fatos: FatoRecuperado[],
  ambiente: "producao" | "homologacao",
): ContextoConfianca {
  return {
    requestedAction: null,
    fatos,
    retrievedSources: [
      { tipo: "catalogo_publicado", referencia: "cat", temConteudo: true, publicado: true },
    ],
    toolResults: [
      {
        nome: "buscar_conhecimento",
        fonte: "catalogo_publicado",
        capacidade: "searchKnowledgeBase",
        success: true,
        temConteudo: true,
        erro: null,
      },
    ],
    businessContext: {
      ambiente,
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

describe("FASE 4 — o resumo legado não reduz mais os preços a uma referência", () => {
  it("knowledge-contract preserva dinheiro e cartão quando divergem", () => {
    const r = montarResultadoConhecimento({
      registros: [ECG],
      base: { versao: 6, arquivo: "catalogo.xlsx" },
    }) as Record<string, unknown>;
    expect(String(r["price"])).toContain("51,00");
    expect(String(r["price"])).toContain("60,00");
  });

  it("catálogo publicado aplica a mesma regra", () => {
    const r = montarResultadoCatalogo({
      servicos: [
        {
          id: "s1",
          nome: "Eletrocardiograma",
          formas_pagamento: [
            { forma: "Dinheiro", valor: 51 },
            { forma: "Cartão", valor: 60 },
          ],
        },
      ] as never,
      profissionais: [],
      hojeISO: "2026-01-05",
    }) as Record<string, unknown>;
    expect(String(r["price"])).toContain("51,00");
    expect(String(r["price"])).toContain("60,00");
  });
});
