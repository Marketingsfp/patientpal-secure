import { describe, expect, it } from "bun:test";
import { itensDeOferta } from "./escala-publicada";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import type { ContextoConfianca } from "./types";

const contexto: ContextoConfianca = {
  requestedAction: null,
  fatos: [
    {
      consulta: "catalogo",
      fonte: "catalogo_publicado",
      capacidade: "searchKnowledgeBase",
      entidade: "servico",
      campo: "nome",
      valor: "Cardiologia",
      chave: { procedimento: "Cardiologia" },
    },
  ],
  consultas: [
    {
      id: "catalogo",
      consulta: "catalogo",
      capacidade: "searchKnowledgeBase",
      status: "com_itens",
      tentativas: 1,
      falhasAnteriores: [],
    },
  ],
  retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
  toolResults: [],
  businessContext: {
    ambiente: "homologacao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
};

describe("partícula de confirmação na oferta de serviço", () => {
  it.each([
    "Temos atendimento em **Cardiologia** sim! Confira os nossos profissionais, horários habituais e valores:",
    "Temos atendimento em Cardiologia sim.",
    "Temos atendimento em Cardiologia, sim!",
    "Sim, temos atendimento em Cardiologia!",
    "Sim! Temos atendimento em Cardiologia.",
    "Temos atendimento em Cardiologia — sim!",
    "Temos atendimento em sim, Cardiologia.",
  ])("confere a especialidade da base sem incorporar sim ao nome: %s", (texto) => {
    const precos = avaliarGrounding(contexto, texto).claims.filter((c) => c.tipo === "servico");
    expect(precos).toHaveLength(1);
    expect(precos[0]?.suportado).toBe(true);
    expect(
      extrairClaimsDoTexto(texto)
        .filter((c) => c.tipo === "servico")
        .map((c) => c.valor),
    ).toEqual(["Cardiologia"]);
  });

  it.each(["sim", "sim!", "Sim, sim!"])("confirmação isolada não inventa serviço: %s", (texto) => {
    expect(extrairClaimsDoTexto(texto).filter((c) => c.tipo === "servico")).toHaveLength(0);
    expect(itensDeOferta(texto)).toEqual([]);
  });

  it.each([
    "Cardiologia Infantil",
    "Cardiologia Fetal",
    "Cardiologia Pediátrica",
    "Oncologia",
    "Cardiologia Simples",
  ])("não altera ou aprova um serviço diferente: %s", (nome) => {
    const texto = `Temos atendimento em ${nome}, sim!`;
    expect(extrairClaimsDoTexto(texto).find((c) => c.tipo === "servico")?.valor).toBe(nome);
    expect(
      avaliarGrounding(contexto, texto).claims.some((c) => c.tipo === "servico" && !c.suportado),
    ).toBe(true);
  });

  it("mantém cada serviço da lista, inclusive o não publicado", () => {
    const r = avaliarGrounding(contexto, "Temos atendimento em Cardiologia e Oncologia, sim!");
    expect(r.claims.filter((c) => c.tipo === "servico")).toHaveLength(2);
    expect(r.claims.some((c) => c.trecho.includes("Cardiologia") && c.suportado)).toBe(true);
    expect(r.claims.some((c) => c.trecho.includes("Oncologia") && !c.suportado)).toBe(true);
  });

  it("não transforma a negativa factual em oferta positiva", () => {
    const claims = extrairClaimsDoTexto("Não temos atendimento em Cardiologia, sim.").filter(
      (c) => c.tipo === "servico",
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.modalidade).toBe("negacao");
    expect(claims[0]?.valor).toBe("Cardiologia");
    const semConsulta = avaliarGrounding(
      { ...contexto, consultas: [], fatos: [], retrievedSources: [] },
      "Não temos atendimento em Cardiologia, sim.",
    );
    expect(semConsulta.claims.some((c) => c.tipo === "servico" && !c.suportado)).toBe(true);
  });

  it("não remove ausência ou restrição do nome do serviço", () => {
    expect(itensDeOferta("Temos atendimento em Cardiologia sem cirurgia, sim!")).toEqual([
      "Cardiologia sem cirurgia",
    ]);
    expect(itensDeOferta("Temos atendimento em Cardiologia somente infantil, sim!")).toEqual([
      "Cardiologia somente infantil",
    ]);
  });

  it("não converte a primeira oração negativa em oferta por causa do sim posterior", () => {
    const texto = "Não temos atendimento em Cardiologia, mas temos atendimento em Oncologia, sim.";
    const claims = extrairClaimsDoTexto(texto).filter((c) => c.tipo === "servico");
    expect(claims.some((c) => c.valor === "Cardiologia" && c.modalidade === "negacao")).toBe(true);
    expect(claims.some((c) => c.valor === "Cardiologia" && c.modalidade === "afirmacao")).toBe(
      false,
    );
  });
});
