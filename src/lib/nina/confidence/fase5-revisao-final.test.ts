/**
 * FASE 5 — REVISÃO FINAL E LIBERAÇÃO DA SAÍDA.
 *
 * Cobre: correção, esclarecimento, nova consulta, limite de tentativas, falha
 * do avaliador, todas as origens de resposta e a diferença entre observar e
 * aplicar.
 */
import { describe, expect, it } from "bun:test";
import {
  ORIGENS_REVISADAS,
  confirmarResultadoRevisao,
  exigeRevisao,
  motivoDaRevisao,
  origemDaSaida,
  podeReexecutarNaRevisao,
  revisarAcaoCritica,
  revisarSaida,
  type OrigemSaida,
} from "./revisao-final";
import type { ResultadoConfianca } from "./types";

function resultado(p: Partial<ResultadoConfianca>): ResultadoConfianca {
  const base = {
    tipoAvaliacao: "answer_confidence",
    score: 80,
    level: "MEDIUM",
    decision: "ALLOW",
    evidenceCoverage: 100,
    hardBlockers: [],
    checks: [],
    validators: [],
    evidence: { categorias: [] },
  } as unknown as ResultadoConfianca;
  return { ...base, ...p } as ResultadoConfianca;
}

const validador = (validator: string, status: string, reasonCode: string) =>
  ({ validator, status, score: 0, reasonCode, evidence: {} }) as never;

describe("origens da resposta", () => {
  it("toda origem de texto passa pela revisão", () => {
    for (const origem of ORIGENS_REVISADAS) {
      const r = revisarSaida({
        origem,
        textoFinal: "texto",
        avaliacao: resultado({}),
        etapa: "A",
      });
      expect(r.revisada).toBe(true);
      expect(r.origem).toBe(origem);
    }
  });

  it("traduz a origem registrada e os sinais do desfecho", () => {
    expect(origemDaSaida("modelo")).toBe("modelo");
    expect(origemDaSaida("fallback_erro")).toBe("fallback");
    expect(origemDaSaida("codigo", { handoff: true })).toBe("transferencia");
    expect(origemDaSaida("codigo", { limiteRodadas: true })).toBe("limite_rodadas");
    expect(origemDaSaida("codigo", { encerramento: true })).toBe("encerramento");
    expect(origemDaSaida(null)).toBe("desconhecida");
  });

  it("turno sem texto não gera revisão", () => {
    expect(exigeRevisao("")).toBe(false);
    expect(exigeRevisao("   ")).toBe(false);
    expect(exigeRevisao("oi")).toBe(true);
  });
});

describe("motivo e ação recomendada", () => {
  it("falta dado do paciente pede esclarecimento", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "C",
      avaliacao: resultado({
        decision: "CLARIFY",
        validators: [validador("IntentValidator", "FAIL", "INTENCAO_AMBIGUA")],
      }),
    });
    expect(r.motivo).toBe("FALTA_DADO_PACIENTE");
    expect(r.acaoRecomendada).toBe("ESCLARECER");
    expect(r.acaoAplicada).toBe("ESCLARECER");
  });

  it("falta de evidência recuperável pede nova consulta", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "B",
      avaliacao: resultado({
        decision: "HANDOFF",
        validators: [validador("ToolIntegrityValidator", "BLOCK", "FERRAMENTA_FALHOU")],
      }),
    });
    expect(r.motivo).toBe("FALTA_EVIDENCIA_RECUPERAVEL");
    expect(r.acaoRecomendada).toBe("NOVA_CONSULTA");
    expect(r.podeTentarCorrecao).toBe(true);
  });

  it("contradição com a fonte manda corrigir e reavaliar, mesmo na etapa A", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "A",
      avaliacao: resultado({
        decision: "HANDOFF",
        hardBlockers: ["FATO_CONTRADITO_PELA_FONTE"],
      }),
    });
    expect(r.motivo).toBe("CONTRADICAO_COM_FONTE");
    expect(r.acaoRecomendada).toBe("CORRIGIR_E_REAVALIAR");
    expect(r.protecaoObrigatoria).toBe(true);
    expect(r.aplicada).toBe(true);
  });

  it("obrigação descumprida manda corrigir e reavaliar", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "Oi! Tudo bem?",
      etapa: "B",
      avaliacao: resultado({
        validators: [
          validador("InstructionComplianceValidator", "FAIL", "OBRIGACOES_DESCUMPRIDAS"),
        ],
      }),
    });
    expect(r.motivo).toBe("OBRIGACAO_DESCUMPRIDA");
    expect(r.acaoRecomendada).toBe("CORRIGIR_E_REAVALIAR");
  });

  it("operação sem comprovação impede afirmar sucesso em qualquer etapa", () => {
    const r = revisarSaida({
      origem: "template",
      textoFinal: "Seu agendamento está confirmado!",
      etapa: "A",
      avaliacao: resultado({}),
      operacaoAfirmada: true,
      operacaoComprovada: false,
    });
    expect(r.motivo).toBe("OPERACAO_SEM_COMPROVACAO");
    expect(r.acaoAplicada).toBe("IMPEDIR_AFIRMACAO_SUCESSO");
    expect(r.protecaoObrigatoria).toBe(true);
    expect(r.aprovada).toBe(false);
  });

  it("saída sem problema é liberada e aprovada", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "Nosso endereço é a Rua X, 100.",
      etapa: "A",
      avaliacao: resultado({ decision: "ALLOW", score: 95, level: "HIGH" }),
    });
    expect(r.motivo).toBe("SEM_PROBLEMA");
    expect(r.aprovada).toBe(true);
    expect(r.aplicada).toBe(false);
  });
});

describe("etapa de ativação: observar x aplicar", () => {
  it("etapa A apenas observa o esclarecimento recomendado", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "A",
      avaliacao: resultado({
        decision: "CLARIFY",
        validators: [validador("IntentValidator", "FAIL", "INTENCAO_AMBIGUA")],
      }),
    });
    expect(r.acaoRecomendada).toBe("ESCLARECER");
    expect(r.acaoAplicada).toBe("LIBERAR");
    expect(r.apenasObservou).toBe(true);
    expect(r.motivoNaoAplicacao).toContain("etapa_A");
  });

  it("etapa B ainda não aplica esclarecimento, mas aplica desfecho", () => {
    const clarify = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "B",
      avaliacao: resultado({
        decision: "CLARIFY",
        validators: [validador("IntentValidator", "FAIL", "AMBIGUIDADE")],
      }),
    });
    expect(clarify.apenasObservou).toBe(true);

    const impasse = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "B",
      avaliacao: resultado({ decision: "HANDOFF" }),
    });
    expect(impasse.motivo).toBe("IMPASSE");
    expect(impasse.acaoAplicada).toBe("DESFECHO_EXPLICITO");
    expect(impasse.aplicada).toBe(true);
  });

  it("a revisão nunca promove a clínica de etapa", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "A",
      avaliacao: resultado({ decision: "HANDOFF" }),
    });
    expect(r.etapa).toBe("A");
    expect(r.acaoAplicada).toBe("LIBERAR");
  });
});

describe("limite de tentativas", () => {
  it("estourar o limite vira impasse com desfecho explícito", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "B",
      tentativa: 2,
      avaliacao: resultado({
        validators: [
          validador("InstructionComplianceValidator", "FAIL", "OBRIGACOES_DESCUMPRIDAS"),
        ],
      }),
    });
    expect(r.motivo).toBe("IMPASSE");
    expect(r.acaoRecomendada).toBe("DESFECHO_EXPLICITO");
    expect(r.podeTentarCorrecao).toBe(false);
  });

  it("a revisão nunca repete operação com efeito externo", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "B",
      avaliacao: resultado({}),
    });
    expect(r.efeitosExternosPermitidos).toBe(false);
    expect(podeReexecutarNaRevisao("searchKnowledgeBase")).toBe(true);
    expect(podeReexecutarNaRevisao("checkAvailability")).toBe(true);
    expect(podeReexecutarNaRevisao("createAppointment")).toBe(false);
    expect(podeReexecutarNaRevisao("requestHumanHandoff")).toBe(false);
  });
});

describe("falha técnica do avaliador", () => {
  it("não vira aprovação em turno informativo: libera degradado e registrado", () => {
    const r = revisarSaida({
      origem: "fallback",
      textoFinal: "t",
      etapa: "A",
      avaliacao: null,
      falhaAvaliador: "timeout",
      risco: "informativo",
    });
    expect(r.motivo).toBe("AVALIADOR_INDISPONIVEL");
    expect(r.aprovada).toBe(false);
    expect(r.degradado).toBe("liberacao_registrada_sem_aprovacao");
    expect(r.erroAvaliador).toBe("timeout");
  });

  it("em risco operacional o desfecho é explícito e obrigatório", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "t",
      etapa: "A",
      avaliacao: null,
      risco: "critico",
    });
    expect(r.acaoRecomendada).toBe("DESFECHO_EXPLICITO");
    expect(r.protecaoObrigatoria).toBe(true);
    expect(r.aplicada).toBe(true);
  });

  it("sem avaliador, operação afirmada sem prova continua sendo a proteção principal", () => {
    const r = revisarSaida({
      origem: "modelo",
      textoFinal: "Agendado!",
      etapa: "A",
      avaliacao: null,
      operacaoAfirmada: true,
    });
    expect(r.motivo).toBe("OPERACAO_SEM_COMPROVACAO");
  });
});

describe("resultado efetivamente comprovado", () => {
  const base = revisarSaida({
    origem: "modelo",
    textoFinal: "t",
    etapa: "B",
    avaliacao: resultado({ decision: "HANDOFF" }),
  });

  it("decisão não é prova", () => {
    const r = confirmarResultadoRevisao(base, { executada: true, comprovacao: null });
    expect(r.comprovado).toBe(false);
    expect(r.observacao).toContain("não comprovado");
  });

  it("com evidência externa o resultado é comprovado", () => {
    const r = confirmarResultadoRevisao(base, { executada: true, comprovacao: "handoff-123" });
    expect(r.comprovado).toBe(true);
  });

  it("ação não executada fica declarada", () => {
    const r = confirmarResultadoRevisao(base, { executada: false });
    expect(r.executada).toBe(false);
    expect(r.comprovado).toBe(false);
  });
});

describe("ação crítica antes da execução", () => {
  it("bloqueador absoluto impede a execução em qualquer etapa", () => {
    const r = revisarAcaoCritica({
      avaliacaoAcao: resultado({ hardBlockers: ["MISSING_REQUIRED_OFFICIAL_SOURCE"] }),
      etapa: "A",
    });
    expect(r.liberada).toBe(false);
    expect(r.protecaoObrigatoria).toBe(true);
  });

  it("sem avaliação a ação crítica não é liberada", () => {
    expect(revisarAcaoCritica({ avaliacaoAcao: null, etapa: "D" }).liberada).toBe(false);
  });

  it("requisito operacional ausente impede a execução", () => {
    const r = revisarAcaoCritica({
      avaliacaoAcao: resultado({}),
      etapa: "D",
      requisitosSatisfeitos: false,
    });
    expect(r.liberada).toBe(false);
    expect(r.motivo).toBe("REQUISITO_OPERACIONAL_AUSENTE");
  });

  it("ação segura é liberada", () => {
    expect(revisarAcaoCritica({ avaliacaoAcao: resultado({}), etapa: "D" }).liberada).toBe(true);
  });
});

describe("motivoDaRevisao isolado", () => {
  it("sem avaliação devolve avaliador indisponível", () => {
    expect(motivoDaRevisao(null)).toBe("AVALIADOR_INDISPONIVEL");
  });

  it("origem desconhecida não impede a revisão", () => {
    const origem: OrigemSaida = "desconhecida";
    expect(revisarSaida({ origem, textoFinal: "t", etapa: "A", avaliacao: resultado({}) }).revisada).toBe(
      true,
    );
  });
});
