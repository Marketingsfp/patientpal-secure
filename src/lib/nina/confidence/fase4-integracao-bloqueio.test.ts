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
import { avaliarGrounding } from "./claims";
import { verificarRespostaFinal } from "./final-answer";
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

function contexto(fatos: FatoRecuperado[], ambiente: "producao" | "homologacao"): ContextoConfianca {
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

function monetarias(registros: Registro[], resposta: string) {
  return avaliarGrounding(contexto(fatosDe(registros), "producao"), resposta).claims.filter(
    (c) => c.tipo === "valor",
  );
}

describe("FASE 4 — as evidências completas chegam à verificação final", () => {
  it("resposta correta com dinheiro e cartão não recebe bloqueio monetário", () => {
    const texto = "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão.";
    const r = verificarRespostaFinal({
      ctx: contexto(fatosDe([ECG]), "producao"),
      textoFinal: texto,
    });
    expect(r.tipoAvaliacao).toBe("answer_confidence");
    expect(r.level).not.toBe("LOW");
    const claims = monetarias([ECG], texto);
    expect(claims).toHaveLength(2);
    expect(claims.every((c) => c.suportado)).toBe(true);
  });

  it("valor realmente incorreto continua reprovado no texto final", () => {
    const texto = "No cartão o eletrocardiograma sai por R$ 999,00.";
    const claims = monetarias([ECG], texto);
    expect(claims[0]!.situacao).toBe("divergente");
    expect(claims[0]!.suportado).toBe(false);
    const r = verificarRespostaFinal({
      ctx: contexto(fatosDe([ECG]), "producao"),
      textoFinal: texto,
    });
    expect(r.level).toBe("LOW");
  });

  it("a avaliação vale para o texto exato (hash do texto final)", () => {
    const texto = "O eletrocardiograma custa R$ 51,00 no dinheiro.";
    const r = verificarRespostaFinal({
      ctx: contexto(fatosDe([ECG]), "producao"),
      textoFinal: texto,
    });
    expect(typeof r.textoAvaliadoHash).toBe("string");
    expect(r.textoAvaliadoHash).not.toBe("");
  });

  it("homologação usa o mesmo motor: valor errado também é LOW", () => {
    const r = verificarRespostaFinal({
      ctx: contexto(fatosDe([ECG]), "homologacao"),
      textoFinal: "No cartão o eletrocardiograma sai por R$ 999,00.",
    });
    expect(r.level).toBe("LOW");
  });
});

describe("FASE 4 — diagnóstico técnico por afirmação monetária", () => {
  it("valor correto: registra referência, valor esperado, fonte e condição", () => {
    const [claim] = monetarias([ECG], "No cartão o eletrocardiograma custa R$ 60,00.");
    const d = claim!.diagnostico;
    expect(d).toBeDefined();
    expect(d!.resultado).toBe("valor_correto");
    expect(d!.valorAfirmado).toContain("60");
    expect(d!.forma).toBe("cartao");
    expect(d!.valorEsperado).toBe("60");
    expect(d!.fonte).toBeTruthy();
    expect(d!.referencia).toBeTruthy();
  });

  it("valor divergente na mesma condição é classificado como valor_divergente", () => {
    const [claim] = monetarias([ECG], "No cartão o eletrocardiograma custa R$ 999,00.");
    expect(claim!.diagnostico!.resultado).toBe("valor_divergente");
    expect(claim!.diagnostico!.valorEsperado).toBe("60");
  });

  it("referência ausente para a condição não vira divergência de valor", () => {
    const [claim] = monetarias(
      [{ id: "r", procedimento: "Eletrocardiograma", preco_dinheiro: 51 }],
      "No cartão o eletrocardiograma custa R$ 51,00.",
    );
    expect(claim!.situacao).toBe("fora_do_escopo");
    expect(claim!.diagnostico!.resultado).toBe("referencia_ausente");
  });

  it("condição ambígua: a frase não diz a forma e a fonte tem preços diferentes", () => {
    const [claim] = monetarias([ECG], "O eletrocardiograma custa R$ 55,00.");
    expect(claim!.diagnostico!.resultado).toBe("condicao_ambigua");
    expect(claim!.situacao).toBe("nao_verificado");
    expect(claim!.suportado).toBe(false);
  });
});

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
