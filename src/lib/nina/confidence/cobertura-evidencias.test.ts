/**
 * FASE 3 — MATEMÁTICA E SIGNIFICADO DO SCORE.
 *
 * Gate de saída, em ordem:
 *  1. pouca evidência != 100
 *  2. UNKNOWN != PASS
 *  3. NOT_APPLICABLE legítimo continua possível
 *  4. cobertura é registrada
 *  5. dimensão crítica desconhecida limita a decisão
 */
import { describe, expect, it } from "bun:test";
import { decidirConfianca } from "./engine";
import {
  aplicarPolitica,
  medirEvidencia,
  POLITICA_PADRAO,
  VERSAO_POLITICA,
} from "./policy";
import {
  OfficialSourceValidator,
  RequiredDataValidator,
  ToolIntegrityValidator,
} from "./validators";
import type { AcaoSolicitada, ContextoConfianca, ResultadoValidador } from "./types";

function ctx(over: Partial<ContextoConfianca> = {}): ContextoConfianca {
  return {
    requestedAction: "responder_informacao",
    retrievedSources: [],
    toolResults: [],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
    ...over,
  };
}

function v(
  validator: string,
  status: ResultadoValidador["status"],
  score = 100,
): ResultadoValidador {
  return { validator, status, score, reasonCode: "TESTE", evidence: {} };
}

const politicaBase = {
  penalidade: 0,
  bloqueadores: [] as never[],
  hardBlockers: [] as never[],
  risco: "LOW" as const,
  acao: "responder_informacao" as AcaoSolicitada as string,
  esclarecimentoUsado: false,
};

// ---------------------------------------------------------------------------
// 1. Pouca evidência não é 100
// ---------------------------------------------------------------------------
describe("FASE 3.1 — pouca evidência nunca vale 100", () => {
  it("sem nenhuma dimensão avaliável a nota é 0 e o turno é declarado insuficiente", () => {
    const todosNA = [
      "IntentClarityValidator",
      "OfficialSourceValidator",
      "ToolIntegrityValidator",
    ].map((n) => v(n, "NOT_APPLICABLE"));

    const m = medirEvidencia(todosNA, POLITICA_PADRAO);
    expect(m.score).toBe(0);
    expect(m.semEvidencia).toBe(true);
  });

  it("confiança insuficiente jamais produz ALLOW nem HIGH", () => {
    const saida = aplicarPolitica(
      { ...politicaBase, scoreValidadores: 0, semEvidencia: true, cobertura: 0 },
      POLITICA_PADRAO,
    );
    expect(saida.score).toBe(0);
    expect(saida.level).not.toBe("HIGH");
    expect(saida.decision).not.toBe("ALLOW");
    expect(saida.limitacoes).toContain("CONFIDENCE_INSUFFICIENT");
  });

  it("sinal conhecido excelente com cobertura baixa fica limitado (96 não vira 96%)", () => {
    const saida = aplicarPolitica(
      { ...politicaBase, scoreValidadores: 96, cobertura: 38 },
      POLITICA_PADRAO,
    );
    expect(saida.score).toBeLessThanOrEqual(POLITICA_PADRAO.cobertura.tetoScoreCoberturaBaixa);
    expect(saida.level).not.toBe("HIGH");
    expect(saida.decision).not.toBe("ALLOW");
    expect(saida.limitacoes).toContain("LOW_EVIDENCE_COVERAGE");
    expect(saida.limitacoes).toContain("COVERAGE_BELOW_ALLOW");
  });
});

// ---------------------------------------------------------------------------
// 2. UNKNOWN não é PASS
// ---------------------------------------------------------------------------
describe("FASE 3.2 — UNKNOWN não é PASS", () => {
  it("UNKNOWN sai da nota mas derruba a cobertura", () => {
    const m = medirEvidencia(
      [v("IntentClarityValidator", "PASS"), v("OfficialSourceValidator", "UNKNOWN", 0)],
      POLITICA_PADRAO,
    );
    // Nota dos sinais conhecidos continua alta...
    expect(m.score).toBe(100);
    // ...mas a cobertura denuncia o que não foi visto (15 de 35 de peso).
    expect(m.cobertura).toBeLessThan(100);
    expect(m.desconhecidas).toContain("OfficialSourceValidator");
  });

  it("um validador UNKNOWN não é contado como aprovado", () => {
    const m = medirEvidencia([v("OfficialSourceValidator", "UNKNOWN", 0)], POLITICA_PADRAO);
    expect(m.semEvidencia).toBe(true);
    expect(m.score).toBe(0);
  });

  it("agendar sem campos obrigatórios declarados é UNKNOWN, não dispensa", () => {
    const r = RequiredDataValidator(ctx({ requestedAction: "criar_agendamento" }));
    expect(r.status).toBe("UNKNOWN");
    expect(r.reasonCode).toBe("CAMPOS_OBRIGATORIOS_NAO_DECLARADOS");
  });

  it("ação desconhecida deixa a necessidade de fonte oficial indeterminada", () => {
    const r = OfficialSourceValidator(ctx({ requestedAction: "desconhecida" }), []);
    expect(r.status).toBe("UNKNOWN");
  });

  it("informar valor sem nenhuma consulta é UNKNOWN na integridade de ferramentas", () => {
    const r = ToolIntegrityValidator(ctx({ requestedAction: "informar_valor" }));
    expect(r.status).toBe("UNKNOWN");
    expect(r.reasonCode).toBe("SEM_CONSULTA_PARA_ACAO_QUE_EXIGE_DADO");
  });
});

// ---------------------------------------------------------------------------
// 3. NOT_APPLICABLE legítimo continua existindo
// ---------------------------------------------------------------------------
describe("FASE 3.3 — dispensa legítima continua possível", () => {
  it("saudação simples não precisa de Agenda nem de catálogo", () => {
    const r = ToolIntegrityValidator(ctx({ requestedAction: "responder_informacao" }));
    expect(r.status).toBe("NOT_APPLICABLE");
    expect(OfficialSourceValidator(ctx({ requestedAction: "responder_informacao" }), []).status).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("NOT_APPLICABLE não pesa contra a cobertura", () => {
    const m = medirEvidencia(
      [v("IntentClarityValidator", "PASS"), v("ConflictValidator", "NOT_APPLICABLE")],
      POLITICA_PADRAO,
    );
    expect(m.cobertura).toBe(100);
    expect(m.naoAplicaveis).toContain("ConflictValidator");
    expect(m.desconhecidas).toHaveLength(0);
  });

  it("resposta bem embasada continua conseguindo ALLOW", () => {
    const r = decidirConfianca(
      ctx({
        requestedAction: "informar_valor",
        draftText: "A ultrassonografia abdominal custa R$ 180,00.",
        toolResults: [
          {
            nome: "buscar_catalogo",
            capacidade: "searchKnowledgeBase",
            fonte: "catalogo",
            success: true,
            temConteudo: true,
          },
        ],
        retrievedSources: [
          { tipo: "catalogo_publicado", temConteudo: true, publicado: true, referencia: "proc#1" },
        ],
        fatos: [
          {
            consulta: "buscar_catalogo",
            capacidade: "searchKnowledgeBase",
            entidade: "procedimento",
            campo: "preco",
            valor: "R$ 180,00",
            registro: "Ultrassonografia abdominal",
            fonte: "catalogo_publicado",
            chave: { procedimento: "Ultrassonografia abdominal" },
          },
        ],
      }),
    );
    expect(r.decision).toBe("ALLOW");
    expect(r.evidenceCoverage).toBe(100);
    expect(r.confidenceInsufficient).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. A cobertura é registrada na decisão
// ---------------------------------------------------------------------------
describe("FASE 3.4 — cobertura registrada e auditável", () => {
  it("o resultado do motor carrega cobertura, dimensões desconhecidas e insuficiência", () => {
    const r = decidirConfianca(ctx({ requestedAction: "desconhecida", draftText: "Sim." }));
    expect(typeof r.evidenceCoverage).toBe("number");
    expect(r.evidenceCoverage).toBeGreaterThanOrEqual(0);
    expect(r.evidenceCoverage).toBeLessThanOrEqual(100);
    expect(Array.isArray(r.unknownDimensions)).toBe(true);
    expect(r.unknownDimensions.length).toBeGreaterThan(0);
    expect(r.evidence.motivos.join(" ")).toContain("dimensões sem evidência");
  });

  it("a política de confiança está versionada em v5 (interpretação mudou)", () => {
    expect(VERSAO_POLITICA).toBe("v5");
    expect(POLITICA_PADRAO.cobertura.minimaParaHigh).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Dimensão crítica desconhecida limita a decisão
// ---------------------------------------------------------------------------
describe("FASE 3.5 — dimensão crítica desconhecida limita a decisão", () => {
  it("dimensão crítica UNKNOWN impede HIGH mesmo com sinais conhecidos perfeitos", () => {
    const saida = aplicarPolitica(
      {
        ...politicaBase,
        scoreValidadores: 100,
        cobertura: 85,
        dimensoesDesconhecidas: ["ToolIntegrityValidator"],
      },
      POLITICA_PADRAO,
    );
    expect(saida.score).toBeLessThan(POLITICA_PADRAO.limites.HIGH);
    expect(saida.level).not.toBe("HIGH");
    expect(saida.limitacoes).toContain("CRITICAL_DIMENSION_UNKNOWN");
  });

  it("fonte obrigatória desconhecida nunca libera a resposta", () => {
    const saida = aplicarPolitica(
      {
        ...politicaBase,
        scoreValidadores: 100,
        cobertura: 90,
        dimensoesDesconhecidas: ["OfficialSourceValidator"],
      },
      POLITICA_PADRAO,
    );
    expect(saida.decision).not.toBe("ALLOW");
    expect(saida.limitacoes).toContain("REQUIRED_SOURCE_UNKNOWN");
  });

  it("fonte obrigatória desconhecida numa ação de escrita bloqueia a ação", () => {
    const saida = aplicarPolitica(
      {
        ...politicaBase,
        acao: "criar_agendamento",
        scoreValidadores: 100,
        cobertura: 90,
        dimensoesDesconhecidas: ["OfficialSourceValidator"],
      },
      POLITICA_PADRAO,
    );
    expect(saida.decision).toBe("BLOCK_ACTION");
  });

  it("os tetos vivem na política, não espalhados pelo motor", () => {
    const frouxa = {
      ...POLITICA_PADRAO,
      cobertura: { ...POLITICA_PADRAO.cobertura, dimensoesCriticas: [], fontesObrigatorias: [] },
    };
    const saida = aplicarPolitica(
      {
        ...politicaBase,
        scoreValidadores: 100,
        cobertura: 100,
        dimensoesDesconhecidas: ["OfficialSourceValidator"],
      },
      frouxa,
    );
    expect(saida.decision).toBe("ALLOW");
  });
});
