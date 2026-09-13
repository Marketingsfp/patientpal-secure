import { describe, expect, it } from "bun:test";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import { extrairEvidencia } from "./evidencia-extrator";
import { itensDeOferta } from "./escala-publicada";
import type { ContextoConfianca } from "./types";

const evidencia = extrairEvidencia({
  ferramenta: "consultar_base_conhecimento",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  dados: { records: [{ id: "consulta-1", procedimento: "Consulta Cardiologia" }] },
});
const contexto: ContextoConfianca = {
  requestedAction: null,
  intent: "informacao",
  mensagemPaciente: "Vocês têm cardiologista?",
  fatos: evidencia.fatos,
  consultas: [evidencia.consulta],
  retrievedSources: [{ tipo: "catalogo_publicado", publicado: true, temConteudo: true }],
  toolResults: [
    {
      nome: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "catalogo_publicado",
      success: true,
      temConteudo: true,
    },
  ],
  businessContext: {
    ambiente: "homologacao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
};

describe("oferta de especialidade seguida de cabeçalho de profissionais", () => {
  for (const final of [
    "com os seguintes profissionais:",
    "com as seguintes médicas:",
    "com especialistas:",
  ]) {
    it(`comprova o serviço publicado ${final}`, () => {
      const texto = `Temos atendimento em **Cardiologia** ${final}`;
      expect(itensDeOferta(texto)).toEqual(["Cardiologia"]);
      expect(
        extrairClaimsDoTexto(texto)
          .filter((c) => c.tipo === "servico")
          .map((c) => c.valor),
      ).toEqual(["Cardiologia"]);
      const r = avaliarGrounding(contexto, texto);
      expect(r.semEvidencia).toEqual([]);
      expect(r.claims.some((c) => c.tipo === "servico" && c.suportado)).toBe(true);
    });
  }

  it("continua bloqueando uma especialidade não publicada", () => {
    const r = avaliarGrounding(
      contexto,
      "Temos atendimento em Oncologia com os seguintes profissionais:",
    );
    expect(r.semEvidencia.some((c) => c.tipo === "servico")).toBe(true);
  });

  it("avalia cada especialidade listada antes do cabeçalho", () => {
    const r = avaliarGrounding(
      contexto,
      "Temos atendimento em Cardiologia e Oncologia com os seguintes profissionais:",
    );
    expect(r.claims.some((c) => c.valorAfirmado === "Cardiologia" && c.suportado)).toBe(true);
    expect(r.semEvidencia.some((c) => c.valorAfirmado === "Oncologia")).toBe(true);
  });

  it("não descarta texto adicional depois de profissionais", () => {
    expect(
      itensDeOferta("Temos atendimento em Oncologia com os seguintes profissionais: estrangeiros"),
    ).toEqual(["Oncologia com os seguintes profissionais: estrangeiros"]);
  });

  it("preserva a verificação do médico mencionado", () => {
    const r = avaliarGrounding(
      contexto,
      "Temos atendimento em Cardiologia com os seguintes profissionais:\nDr. Pedro Inventado atende Cardiologia.",
    );
    expect(r.semEvidencia.some((c) => c.tipo === "profissional")).toBe(true);
  });

  it("preserva a exigência de comprovar a unidade afirmada", () => {
    const r = avaliarGrounding(
      contexto,
      "Temos atendimento em Cardiologia na unidade Norte com os seguintes profissionais:",
    );
    expect(r.semEvidencia.some((c) => c.tipo === "servico")).toBe(true);
  });
});
