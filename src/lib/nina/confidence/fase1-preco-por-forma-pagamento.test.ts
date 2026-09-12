/**
 * FASE 1 — REPRODUÇÃO DO FALSO BLOQUEIO DE PREÇO POR FORMA DE PAGAMENTO.
 *
 * Dados fictícios. Sem banco, sem rede, sem mensagem real.
 *
 * Caso auditado: eletrocardiograma R$ 51,00 no dinheiro e R$ 60,00 no cartão.
 * A resposta que cita os DOIS preços era marcada como divergente porque a
 * evidência entregue ao motor conservava apenas um valor.
 *
 * Estes testes documentam o defeito atual (ver marcações "DEFEITO ATUAL") e
 * permanecem como regressão para as próximas fases: após a correção, os
 * dois preços devem ser confirmados.
 */
import { describe, expect, it } from "bun:test";
import { montarResultadoConhecimento } from "../knowledge-contract";
import { extrairEvidencia, type RetornoFerramenta } from "./evidencia-extrator";
import { avaliarGrounding } from "./claims";
import type { FatoRecuperado } from "./evidencia";
import type { ContextoConfianca } from "./types";

const REGISTRO = {
  id: "reg-ecg",
  procedimento: "Eletrocardiograma",
  medico: "Dra. Marina",
  preco_dinheiro: 51,
  preco_cartao: 60,
} as const;

function retornoDaFerramenta(): RetornoFerramenta {
  const dados = montarResultadoConhecimento({
    registros: [REGISTRO],
    base: { versao: 6, arquivo: "catalogo.xlsx" },
  });
  return {
    ferramenta: "buscar_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados,
    args: { termo: "eletrocardiograma" },
  };
}

function contexto(fatos: FatoRecuperado[]): ContextoConfianca {
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
      ambiente: "producao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

describe("FASE 1 — caminho dos dados do preço", () => {
  it("a ferramenta devolve os dois preços em `records` e resume só o dinheiro em `price`", () => {
    const dados = montarResultadoConhecimento({ registros: [REGISTRO] });
    expect(dados.price).toBe("R$ 51,00");
    expect(dados.records).toHaveLength(1);
    expect(dados.records[0]!.preco_cartao).toBe(60);
    // O contrato NÃO expõe a chave `registros` — só `records`.
    expect((dados as unknown as Record<string, unknown>)["registros"]).toBeUndefined();
  });

  it("FASE 2 — a evidência preserva dinheiro e cartão separadamente", () => {
    const { fatos } = extrairEvidencia(retornoDaFerramenta());
    const precos = fatos
      .filter((f) => f.campo === "preco")
      .map((f) => [f.chave?.condicoes, f.valor]);
    expect(precos).toEqual([
      ["dinheiro", "51"],
      ["cartao", "60"],
    ]);
  });
});

describe("FASE 1 — controle A/B da validação monetária", () => {
  it("B) pergunta só sobre dinheiro: a afirmação de R$ 51,00 é confirmada", () => {
    const { fatos } = extrairEvidencia(retornoDaFerramenta());
    const r = avaliarGrounding(contexto(fatos), "O eletrocardiograma custa R$ 51,00 no dinheiro.");
    const valores = r.claims.filter((c) => c.tipo === "valor");
    expect(valores.length).toBeGreaterThan(0);
    expect(valores.every((c) => c.suportado)).toBe(true);
  });

  it("A) CORRIGIDO NA FASE 3: cada valor é conferido com a sua forma de pagamento", () => {
    const { fatos } = extrairEvidencia(retornoDaFerramenta());
    const r = avaliarGrounding(
      contexto(fatos),
      "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão.",
    );
    const valores = r.claims.filter((c) => c.tipo === "valor");
    const cartao = valores.find((c) => /60/.test(c.trecho));
    expect(cartao).toBeDefined();
    expect(fatos.some((f) => f.chave?.condicoes === "cartao" && f.valor === "60")).toBe(true);
    expect(cartao!.situacao).toBe("confirmado");
    expect(valores.every((c) => c.suportado)).toBe(true);
  });

});
