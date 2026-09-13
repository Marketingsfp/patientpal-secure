import { describe, expect, it } from "bun:test";
import { extrairEvidencia } from "./evidencia-extrator";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import type { ContextoConfianca } from "./types";

const evidencia = extrairEvidencia({
  ferramenta: "consultar_base_conhecimento",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  args: { termo: "cardiologia" },
  dados: {
    records: [
      {
        id: "profissional-teste",
        medico: "Carlos Silva",
        procedimento: "Consulta — CARDIOLOGIA, CARDIOLOGIA INFANTIL",
        extras: {
          especialidades: ["Cardiologia", "Cardiologia Infantil"],
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

const respostaRealSanitizada =
  "Não aceitamos PIX para as consultas de cardiologia. As formas de pagamento cadastradas são apenas **dinheiro** (R$ 120,00) ou **cartão** (R$ 145,00) — para cardiologia infantil com o Dr. Carlos Silva, os valores são R$ 160,00 no dinheiro ou R$ 190,00 no cartão.\n\nGostaria de verificar as datas e horários disponíveis para agendamento com algum dos médicos?";

describe("cada grupo de preços conserva seu próprio assunto", () => {
  it("reproduz a resposta real sem associar o primeiro preço ao médico/modalidade posteriores", () => {
    const precos = extrairClaimsDoTexto(respostaRealSanitizada).filter((c) => c.tipo === "valor");
    expect(
      precos.map((c) => [c.trecho, c.chave?.procedimento, c.chave?.medicoNome, c.chave?.condicoes]),
    ).toEqual([
      ["R$ 120,00", "cardiologia", undefined, "dinheiro"],
      ["R$ 145,00", "cardiologia", undefined, "cartao"],
      ["R$ 160,00", "cardiologia infantil", "Carlos Silva", "dinheiro"],
      ["R$ 190,00", "cardiologia infantil", "Carlos Silva", "cartao"],
    ]);
    const grounding = avaliarGrounding(ctx, respostaRealSanitizada);
    expect(grounding.claims.filter((c) => c.tipo === "valor").every((c) => c.suportado)).toBe(true);
  });

  it.each([
    "Cardiologia custa R$ 120,00 no dinheiro ou R$ 145,00 no cartão — para cardiologia infantil com Dr. Carlos Silva, são R$ 160,00 no dinheiro ou R$ 190,00 no cartão.",
    "Cardiologia infantil com Dr. Carlos Silva custa R$ 160,00 no dinheiro ou R$ 190,00 no cartão — para cardiologia, são R$ 120,00 no dinheiro ou R$ 145,00 no cartão.",
    "R$ 120,00 no dinheiro para cardiologia ou R$ 145,00 no cartão para cardiologia — R$ 160,00 no dinheiro para cardiologia infantil com Dr. Carlos Silva ou R$ 190,00 no cartão para cardiologia infantil com Dr. Carlos Silva.",
    "R$ 160,00 no dinheiro para cardiologia infantil com Dr. Carlos Silva ou R$ 190,00 no cartão para cardiologia infantil com Dr. Carlos Silva — R$ 120,00 no dinheiro para cardiologia ou R$ 145,00 no cartão para cardiologia.",
  ])("confere os qualificadores antes ou depois do valor: %s", (texto) => {
    const precos = avaliarGrounding(ctx, texto).claims.filter((c) => c.tipo === "valor");
    expect(precos).toHaveLength(4);
    expect(precos.every((c) => c.suportado)).toBe(true);
  });

  it.each([
    respostaRealSanitizada.replace("R$ 120,00", "R$ 160,00"),
    respostaRealSanitizada.replace("R$ 145,00", "R$ 190,00"),
    respostaRealSanitizada.replace("R$ 160,00", "R$ 120,00"),
    respostaRealSanitizada.replace("R$ 190,00", "R$ 145,00"),
    "Cardiologia infantil custa R$ 120,00 no dinheiro ou R$ 145,00 no cartão — para cardiologia são R$ 160,00 no dinheiro ou R$ 190,00 no cartão.",
  ])("continua reprovando valores de outra modalidade: %s", (texto) => {
    const precos = avaliarGrounding(ctx, texto).claims.filter((c) => c.tipo === "valor");
    expect(precos.some((c) => !c.suportado)).toBe(true);
  });

  it("não herda o médico do caso infantil quando começa o caso geral", () => {
    const precos = extrairClaimsDoTexto(
      "Cardiologia infantil com Dr. Carlos Silva custa R$ 160,00 no dinheiro — cardiologia custa R$ 120,00 no dinheiro.",
    ).filter((c) => c.tipo === "valor");
    expect(precos[0]?.chave?.medicoNome).toBe("Carlos Silva");
    expect(precos[1]?.chave?.medicoNome).toBeUndefined();
  });

  it("não usa outro parágrafo para preencher o assunto omitido", () => {
    const precos = extrairClaimsDoTexto(
      "Cardiologia infantil com Dr. Carlos Silva.\n\nAs formas de pagamento são dinheiro (R$ 120,00) ou cartão (R$ 145,00).",
    ).filter((c) => c.tipo === "valor");
    expect(precos.every((c) => !c.chave?.procedimento && !c.chave?.medicoNome)).toBe(true);
  });

  it("preserva assunto coletivo após os dois preços sem aceitar preço infantil como geral", () => {
    const correta = "R$ 120,00 no dinheiro ou R$ 145,00 no cartão para cardiologia.";
    const errada = correta.replace("R$ 120,00", "R$ 160,00");
    expect(
      avaliarGrounding(ctx, correta)
        .claims.filter((c) => c.tipo === "valor")
        .every((c) => c.suportado),
    ).toBe(true);
    expect(
      avaliarGrounding(ctx, errada).claims.find((c) => c.trecho === "R$ 160,00")?.suportado,
    ).toBe(false);
  });

  it("não usa o qualificador posterior de outro grupo iniciado por travessão", () => {
    const precos = extrairClaimsDoTexto(
      "R$ 120,00 no dinheiro — R$ 160,00 no dinheiro para cardiologia infantil com Dr. Carlos Silva.",
    ).filter((c) => c.tipo === "valor");
    expect(precos[0]?.chave?.procedimento).toBeUndefined();
    expect(precos[0]?.chave?.medicoNome).toBeUndefined();
    expect(precos[1]?.chave?.procedimento).toBe("cardiologia infantil");
  });

  it("não contamina preço de um médico com o nome do seguinte na mesma especialidade", () => {
    const texto =
      "Cardiologia com Dr. Paulo Mendes custa R$ 120,00 no dinheiro ou R$ 145,00 no cartão — com Dr. Carlos Silva, cardiologia custa R$ 160,00 no dinheiro ou R$ 190,00 no cartão.";
    const precos = extrairClaimsDoTexto(texto).filter((c) => c.tipo === "valor");
    expect(precos.map((c) => c.chave?.medicoNome)).toEqual([
      "Paulo Mendes",
      "Paulo Mendes",
      "Carlos Silva",
      "Carlos Silva",
    ]);
    expect(
      avaliarGrounding(ctx, texto)
        .claims.filter((c) => c.tipo === "valor")
        .every((c) => !c.suportado),
    ).toBe(true);
  });
});
