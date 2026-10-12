/** Regressão de catálogo heterogêneo. Nomes/IDs fictícios; nenhuma consulta externa. */
import { describe, expect, it } from "bun:test";
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
    ferramenta: "consultar_cadastro",
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
});
