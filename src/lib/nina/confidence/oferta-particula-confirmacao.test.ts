import { describe, expect, it } from "bun:test";
import { itensDeOferta } from "./escala-publicada";
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
  it("não remove ausência ou restrição do nome do serviço", () => {
    expect(itensDeOferta("Temos atendimento em Cardiologia sem cirurgia, sim!")).toEqual([
      "Cardiologia sem cirurgia",
    ]);
    expect(itensDeOferta("Temos atendimento em Cardiologia somente infantil, sim!")).toEqual([
      "Cardiologia somente infantil",
    ]);
  });
});
