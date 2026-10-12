import { describe, expect, it } from "bun:test";
import { extrairEvidencia } from "./evidencia-extrator";
import { horariosSemanais } from "./escala-publicada";
import type { ContextoConfianca } from "./types";

const registros = [
  {
    id: "medica-a",
    procedimento: "Consulta Cardiologia",
    medico: "Marina Oliveira",
    dia: "Segunda a Sábado 09:30h",
    extras: { horarios: [{ dia: "Segunda a Sábado", inicio: "09:30" }] },
  },
  {
    id: "medico-b",
    procedimento: "Consulta Cardiologia",
    medico: "Bruno Costa",
    dia: "Quinta 13:30h",
  },
  {
    id: "medico-c",
    procedimento: "Consulta Cardiologia",
    medico: "Carlos Silva",
    dia: "Quarta 13h, Quinta 08h, Sexta 13h, Sábado 08h",
    extras: {
      horarios: [
        { dia: "Quarta", inicio: "13:00" },
        { dia: "Quinta", inicio: "08:00" },
        { dia: "Sexta", inicio: "13:00" },
        { dia: "Sábado", inicio: "08:00" },
      ],
    },
  },
  {
    id: "medico-d",
    procedimento: "Consulta Cardiologia",
    medico: "Daniel Souza",
    dia: "Segunda 09:30h",
  },
  ...["ELETROCARDIOGRAMA", "ECOCARDIOGRAMA", "HOLTER 24H", "MAPA 24H", "TESTE ERGOMETRICO"].map(
    (nome, i) => ({ id: `exame-${i}`, procedimento: nome }),
  ),
];

function contexto(records: unknown[] = registros): ContextoConfianca {
  const evidencia = extrairEvidencia({
    ferramenta: "consultar_cadastro",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados: {
      fonte: "catalogo_publicado",
      records,
      profissionais: ["Marina Oliveira", "Bruno Costa", "Carlos Silva", "Daniel Souza"],
      especialidades: ["CARDIOLOGIA"],
    },
  });
  return {
    requestedAction: null,
    mensagemPaciente: "Vocês têm cardiologista?",
    intent: "informacao",
    fatos: evidencia.fatos,
    consultas: [evidencia.consulta],
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    toolResults: [
      {
        nome: "consultar_cadastro",
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
}

describe("escala publicada versus vagas reais", () => {
  it("expande intervalo e mantém cada grupo associado ao horário correto", () => {
    expect(horariosSemanais("quartas e sextas às 13h, quintas e sábados às 08h")).toEqual([
      { dia: "quarta", hora: "13:00" },
      { dia: "sexta", hora: "13:00" },
      { dia: "quinta", hora: "08:00" },
      { dia: "sabado", hora: "08:00" },
    ]);
    expect(horariosSemanais("segunda a sábado às 09:30")).toHaveLength(6);
  });
});
