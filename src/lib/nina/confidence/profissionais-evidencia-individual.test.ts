/** Regressão de catálogo heterogêneo. Nomes/IDs fictícios; nenhuma consulta externa. */
import { describe, expect, it } from "bun:test";
import { avaliarGrounding } from "./claims";
import { correspondenciaDaAfirmacao } from "./afirmacao";
import { extrairEvidencia } from "./evidencia-extrator";
import type { ContextoConfianca } from "./types";

const consulta = {
  id: "profissional-c",
  medico: "Carlos Silva",
  procedimento: "Consulta — CARDIOLOGIA, CLÍNICO GERAL, CARDIOLOGIA INFANTIL",
  dia: "Quarta 13h, Quinta 08h, Sexta 13h, Sábado 08h",
  extras: {
    unidade: "Centro",
    especialidades: ["CARDIOLOGIA", "CLÍNICO GERAL", "CARDIOLOGIA INFANTIL"],
    horarios: [
      { dia: "Quarta", inicio: "13:00" },
      { dia: "Quinta", inicio: "08:00" },
      { dia: "Sexta", inicio: "13:00" },
      { dia: "Sábado", inicio: "08:00" },
    ],
  },
};
const exame = {
  id: "exame-eco",
  procedimento: "ECOCARDIOGRAMA",
  medico: "Bruno Costa",
};

function extrair(records: unknown[] = [exame, consulta], resumo = "ECOCARDIOGRAMA") {
  return extrairEvidencia({
    ferramenta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados: {
      procedure: resumo,
      base_version: "publicacao-teste",
      records,
      doctors: ["Bruno Costa", "Carlos Silva"],
    },
  });
}

function contexto(evidencia = extrair()): ContextoConfianca {
  return {
    requestedAction: null,
    intent: "informacao",
    mensagemPaciente: "vcs tem cardiologista?",
    fatos: evidencia.fatos,
    consultas: [evidencia.consulta],
    toolResults: [],
    retrievedSources: [{ tipo: "catalogo_publicado", publicado: true, temConteudo: true }],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

describe("evidência individual de profissionais em retorno com vários procedimentos", () => {
  it("confere o trecho real sanitizado pelo registro do médico, mesmo com exame em primeiro", () => {
    const texto =
      "**Dr. Carlos Silva**: Quarta-feira a partir das 13h, quinta-feira a partir das 08h, sexta-feira a partir das 13h e sábado a partir das 08h (Cardiologia Adulto a partir de 15 anos e Cardiologia Infantil a partir de 1 mês).";
    const r = avaliarGrounding(contexto(), texto);
    expect(r.semEvidencia).toEqual([]);
    expect(r.naoVerificados).toEqual([]);
    expect(r.claims.find((c) => c.tipo === "profissional")).toMatchObject({
      situacao: "confirmado",
      referencia: "catalogo_publicado:consultar_base_conhecimento#profissional-c@publicacao-teste",
    });
  });

  it("ordem dos registros e primeiro procedimento não alteram a identidade conferida", () => {
    for (const ev of [extrair(), extrair([consulta, exame], consulta.procedimento)]) {
      const r = avaliarGrounding(contexto(ev), "Dr. Carlos Silva atende Cardiologia.");
      expect(r.semEvidencia).toEqual([]);
      expect(r.claims.find((c) => c.tipo === "profissional")?.suportado).toBe(true);
    }
  });

  it("preserva nome, procedimento, unidade, referência e versão individuais", () => {
    const fatos = extrair().fatos.filter((f) => f.entidade === "profissional");
    expect(fatos).toHaveLength(2);
    expect(fatos.find((f) => f.valor === "Carlos Silva")).toMatchObject({
      registro: "profissional-c",
      versao: "publicacao-teste",
      chave: {
        medicoNome: "Carlos Silva",
        procedimento: consulta.procedimento,
        unidadeId: "Centro",
      },
    });
  });

  it.each([
    "Dr. Bruno Costa atende Cardiologia.",
    "Dr. Carlos Silva atende Dermatologia.",
    "Dr. Médico Inventado atende Cardiologia.",
    "Dr. Carlos Silva atende Cardiologia na unidade Norte.",
    "Dr. Carlos Silva atende quarta às 17h.",
    "Dr. Carlos Silva atende segunda às 13h.",
    "Temos vaga quarta às 13h com Dr. Carlos Silva.",
  ])("não aprova outro escopo ou vaga por existir o nome no resumo: %s", (resposta) => {
    expect(avaliarGrounding(contexto(), resposta).semEvidencia.length).toBeGreaterThan(0);
  });

  it("não transforma nome solto no resumo em prova de execução do exame", () => {
    const ctx = contexto(extrair([exame]));
    expect(
      avaliarGrounding(ctx, "Dr. Carlos Silva realiza ecocardiograma.").semEvidencia.length,
    ).toBeGreaterThan(0);
  });

  it("só associa o executante do registro ao exame, conferindo o escopo explícito", () => {
    for (const [medico, situacao] of [
      ["Bruno Costa", "confirmado"],
      ["Carlos Silva", "fora_do_escopo"],
    ] as const) {
      const r = correspondenciaDaAfirmacao(extrair().fatos, {
        tipo: "profissional",
        entidades: ["profissional"],
        campos: ["nome"],
        frase: `Dr. ${medico} realiza ecocardiograma.`,
        chave: { medicoNome: medico, procedimento: "ECOCARDIOGRAMA" },
        valor: medico,
      });
      expect(r.situacao).toBe(situacao);
    }
  });

  it("aceita especialidade explícita do registro mesmo sem procedimento resumido", () => {
    const ctx = contexto(extrair([{ ...consulta, procedimento: null }]));
    const r = avaliarGrounding(ctx, "Dr. Carlos Silva atende Cardiologia.");
    expect(r.semEvidencia).toEqual([]);
    expect(r.claims.find((c) => c.tipo === "profissional")?.suportado).toBe(true);
  });

  it("preserva contrato legado com nomes e procedimento, sem registros detalhados", () => {
    const r = avaliarGrounding(
      contexto(extrair([], "Consulta Cardiologia")),
      "Dr. Carlos Silva atende Cardiologia.",
    );
    expect(r.semEvidencia).toEqual([]);
    expect(r.claims.find((c) => c.tipo === "profissional")?.suportado).toBe(true);
  });
});
