import { describe, expect, it } from "bun:test";
import { montarInstrucoesDoTurno } from "./contexto-avaliacao";
import { conformidadeDasInstrucoes, decidirEntregaPorConformidade } from "./conformidade-entrega";
import { PROMPT_PUBLICADO_V15 } from "./fixtures/prompt-publicado-v15";
import { InstructionComplianceValidator } from "./obrigacoes";
import { repartirInstrucoes } from "./pontuacao-instrucoes";
import { decidirConfianca } from "./engine";
import { medirEvidencia, POLITICA_PADRAO } from "./policy";
import type { ClasseRegra } from "./regras-publicadas";
import type { ContextoConfianca, ResultadoConfianca } from "./types";

// Cadeia real de agregação com dados sintéticos. A exigência nova permanece
// sem verificador; AMB-01 usa a proteção publicada de homologação.
function avaliar(
  ambiente: "producao" | "homologacao",
  classe: ClasseRegra = "CONVERSACIONAL",
  literal = false,
  fontePresente = true,
  ferramentasCompletas = true,
) {
  const instrucoes = montarInstrucoesDoTurno({
    escopo: "whatsapp",
    versao: "teste",
    texto: PROMPT_PUBLICADO_V15,
  });
  const origem = instrucoes.regras!.find((r) => r.identificador === "CONV-02")!;
  const ambienteRegra = instrucoes.regras!.find((r) => r.identificador === "AMB-01")!;
  instrucoes.regras = [
    {
      ...origem,
      identificador: "TESTE-AGREGACAO",
      descricao: "Exigência publicada sintética",
      trecho: "Exigência sintética sem verificador",
      classe,
      prioridade:
        classe === "ESSENCIAL" ? "critica" : classe === "CONVERSACIONAL" ? "alta" : "normal",
      ...(literal
        ? { verificacao: "literal" as const, literal: "Cardiologia", operador: "inclusao" as const }
        : {}),
    },
    ambienteRegra,
  ];
  const ctx: ContextoConfianca = {
    requestedAction: "informar_profissional",
    turnType: "INFORMACAO",
    mensagemPaciente: "Vocês têm cardiologista?",
    draftText: "Sim, temos Cardiologia. Gostaria de consultar as vagas?",
    instrucoes,
    retrievedSources: fontePresente
      ? [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }]
      : [],
    fatos: fontePresente
      ? [
          {
            consulta: "consultar_base_conhecimento",
            capacidade: "searchKnowledgeBase",
            fonte: "catalogo_publicado",
            entidade: "servico",
            campo: "oferecido",
            valor: "Cardiologia",
          },
        ]
      : [],
    toolResults: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "base_conhecimento",
        success: true,
      },
    ],
    businessContext: {
      ambiente,
      apresentacaoJaFeita: false,
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
    operationalState: {
      workflowState: "INFORMATION_RESPONSE",
      appointmentToolCalled: false,
      appointmentAttempted: false,
      appointmentCreated: false,
      bookingIntentConfirmed: false,
      appointmentFlowActive: false,
      appointmentId: null,
    },
    evidenciasFluxo: {
      registroFerramentasCompleto: ferramentasCompletas,
      historicoCompleto: true,
      historico: [],
      sessionId: "sessao-sintetica",
    },
  };
  const validador = InstructionComplianceValidator(ctx);
  const conformidade = conformidadeDasInstrucoes({ validators: [validador] } as ResultadoConfianca);
  const entrega = decidirEntregaPorConformidade({
    conformidade,
    tentativa: 2,
    limiteTentativas: 2,
  });
  return { ctx, validador, conformidade, entrega };
}

describe("agregação de exigências e paridade de ambiente", () => {
  it.each(["ESSENCIAL", "CONVERSACIONAL"] as const)(
    "proteção cumprida da homologação não apaga exigência %s indeterminada",
    (classe) => {
      const real = avaliar("producao", classe);
      const teste = avaliar("homologacao", classe);
      for (const r of [real, teste]) {
        expect(r.validador.status).toBe("UNKNOWN");
        expect(r.validador.evidence.estadoRestricoes).toBe("indeterminadas");
        expect(r.conformidade.naoVerificadas).toHaveLength(1);
        expect(r.conformidade.motivoBloqueio).toBe("REGRA_PUBLICADA_NAO_VERIFICADA");
        expect(r.entrega.entregar).toBe(false);
        expect(r.entrega.desfechoHumano).toBe(true);
        const reparticao = repartirInstrucoes(r.validador)!;
        expect(reparticao.parcelas.some((p) => p.status === "UNKNOWN")).toBe(true);
        expect(reparticao.memoria.linguagem.indeterminadas).toBe(0);
      }
      const obrigacoes = teste.validador.evidence.obrigacoes as Array<Record<string, unknown>>;
      expect(obrigacoes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "indeterminada", classe }),
          expect.objectContaining({
            status: "cumprida",
            motivo: "HOMOLOGACAO_TURNO_INFORMATIVO_SEM_EFEITO_OPERACIONAL",
          }),
        ]),
      );
    },
  );

  it("linguagem declarada não verificada permanece não bloqueante nos dois ambientes", () => {
    for (const ambiente of ["producao", "homologacao"] as const) {
      const r = avaliar(ambiente, "LINGUAGEM");
      expect(r.validador.status).toBe("PASS");
      expect(r.conformidade.estado).toBe("nao_verificada");
      expect(r.conformidade.bloqueante).toBe(false);
      expect(r.entrega.entregar).toBe(true);
      expect(repartirInstrucoes(r.validador)?.memoria.linguagem.indeterminadas).toBe(1);
    }
  });

  it("com a exigência realmente cumprida os dois ambientes liberam a resposta", () => {
    for (const ambiente of ["producao", "homologacao"] as const) {
      const r = avaliar(ambiente, "CONVERSACIONAL", true);
      expect(r.validador.status).toBe("PASS");
      expect(r.conformidade.estado).toBe("cumprida");
      expect(r.entrega.entregar).toBe(true);
      expect(r.entrega.desfechoHumano).toBe(false);
    }
  });

  it.each([true, false])("mesma avaliação de conteúdo com fontePresente=%s", (fontePresente) => {
    for (const literal of [true, false]) {
      const real = avaliar("producao", "CONVERSACIONAL", literal, fontePresente);
      const teste = avaliar("homologacao", "CONVERSACIONAL", literal, fontePresente);
      const medida = (r: ReturnType<typeof avaliar>) =>
        medirEvidencia(repartirInstrucoes(r.validador)!.parcelas, POLITICA_PADRAO);
      expect(medida(teste)).toEqual(medida(real));
      for (const limite of [70, 85, 95]) {
        const politica = {
          ...POLITICA_PADRAO,
          limites: { ...POLITICA_PADRAO.limites, HIGH: limite },
        };
        const motor = (r: ReturnType<typeof avaliar>) => {
          const d = decidirConfianca(
            { ...r.ctx, tipoAvaliacao: "answer_confidence" },
            { politica, agora: new Date("2026-09-14T12:00:00Z") },
          );
          return {
            score: d.score,
            level: d.level,
            decision: d.decision,
            evidenceCoverage: d.evidenceCoverage,
            hardBlockers: d.hardBlockers,
            segurancaAcao: d.actionSafety?.status,
          };
        };
        expect(motor(teste)).toEqual(motor(real));
      }
      const memoria = repartirInstrucoes(teste.validador)!.memoria;
      expect(memoria.parcelas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            motivo: "HOMOLOGACAO_TURNO_INFORMATIVO_SEM_EFEITO_OPERACIONAL",
            peso: 0,
            contaNaNota: false,
            contaNaCobertura: false,
            status: "PASS",
          }),
        ]),
      );
    }
  });

  it("prova operacional indeterminada fica fora da nota, mas continua bloqueando a entrega", () => {
    const r = avaliar("homologacao", "CONVERSACIONAL", true, true, false);
    expect(r.conformidade.motivoBloqueio).toBe("REGRA_PUBLICADA_NAO_VERIFICADA");
    expect(r.entrega.desfechoHumano).toBe(true);
    const reparticao = repartirInstrucoes(r.validador)!;
    expect(reparticao.memoria.essencial.semProva).toBe(true);
    expect(reparticao.memoria.parcelas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          motivo: "REGISTRO_DE_FERRAMENTAS_INCOMPLETO",
          status: "UNKNOWN",
          peso: 0,
          contaNaNota: false,
          contaNaCobertura: false,
        }),
      ]),
    );
  });
});
