import { describe, expect, it } from "bun:test";
import { decidirConfianca } from "./engine";
import { aplicarPolitica, POLITICA_PADRAO, pontuarValidadores } from "./policy";
import type { ContextoConfianca, ResultadoFerramenta, ResultadoValidador } from "./types";

const negocio = {
  clinicaId: "c1",
  ambiente: "homologacao" as const,
  pacienteIdentificado: false,
  agendamentoConfirmado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
};

const ctx = (over: Partial<ContextoConfianca> = {}): ContextoConfianca => ({
  conversationId: "conv-1",
  messageId: "msg-1",
  requestedAction: "responder_informacao",
  entities: {},
  retrievedSources: [],
  toolResults: [],
  businessContext: negocio,
  ...over,
});

const tool = (o: Partial<ResultadoFerramenta> = {}): ResultadoFerramenta => ({
  nome: "buscar_procedimentos",
  capacidade: "listCatalog",
  fonte: "base_conhecimento",
  success: true,
  temConteudo: true,
  ...o,
});

const v = (nome: string, over: Partial<ResultadoValidador> = {}): ResultadoValidador => ({
  validator: nome,
  status: "PASS",
  score: 100,
  reasonCode: "OK",
  evidence: {},
  ...over,
});

describe("configuração central", () => {
  it("os pesos somam 100", () => {
    const soma = Object.values(POLITICA_PADRAO.pesos).reduce((a, b) => a + b, 0);
    expect(soma).toBe(100);
  });

  it("faixas: HIGH 90+, MEDIUM 75+, LOW abaixo disso", () => {
    expect(POLITICA_PADRAO.limites).toEqual({ HIGH: 90, MEDIUM: 75 });
  });
});

describe("pontuação ponderada", () => {
  it("tudo aprovado dá 100", () => {
    const score = pontuarValidadores([
      v("IntentClarityValidator"),
      v("OfficialSourceValidator"),
    ]);
    expect(score).toBe(100);
  });

  it("NOT_APPLICABLE não pesa contra", () => {
    const score = pontuarValidadores([
      v("IntentClarityValidator"),
      v("OfficialSourceValidator", { status: "NOT_APPLICABLE", score: 0 }),
    ]);
    expect(score).toBe(100);
  });

  it("validador reprovado derruba proporcionalmente ao peso", () => {
    const score = pontuarValidadores([
      v("IntentClarityValidator", { status: "FAIL", score: 0 }), // peso 15
      v("OfficialSourceValidator"), // peso 20
    ]);
    expect(score).toBe(57); // 20 / 35
  });
});

describe("política: score x bloqueadores", () => {
  const base = {
    penalidade: 0,
    bloqueadores: [] as never[],
    hardBlockers: [] as never[],
    risco: "MEDIUM" as const,
    acao: "responder_informacao",
    esclarecimentoUsado: false,
  };

  it("score alto sem bloqueador libera", () => {
    const r = aplicarPolitica({ ...base, scoreValidadores: 92 });
    expect(r.level).toBe("HIGH");
    expect(r.decision).toBe("ALLOW");
  });

  it("score alto COM bloqueador transfere, mesmo com 92", () => {
    const r = aplicarPolitica({
      ...base,
      scoreValidadores: 92,
      hardBlockers: ["SOURCE_CONFLICT"],
    });
    expect(r.decision).toBe("HANDOFF");
    expect(r.score).toBe(0);
  });

  it("bloqueador em ação de escrita vira BLOCK_ACTION", () => {
    const r = aplicarPolitica({
      ...base,
      scoreValidadores: 95,
      acao: "criar_agendamento",
      hardBlockers: ["INCONSISTENT_SCHEDULE"],
    });
    expect(r.decision).toBe("BLOCK_ACTION");
  });

  it("score médio pede esclarecimento", () => {
    const r = aplicarPolitica({ ...base, scoreValidadores: 80 });
    expect(r.level).toBe("MEDIUM");
    expect(r.decision).toBe("CLARIFY");
  });

  it("score médio com esclarecimento já usado transfere", () => {
    const r = aplicarPolitica({ ...base, scoreValidadores: 80, esclarecimentoUsado: true });
    expect(r.decision).toBe("HANDOFF");
  });

  it("score baixo transfere", () => {
    const r = aplicarPolitica({ ...base, scoreValidadores: 60 });
    expect(r.level).toBe("LOW");
    expect(r.decision).toBe("HANDOFF");
  });

  it("ação crítica exige mais que a faixa HIGH mínima", () => {
    const r = aplicarPolitica({ ...base, scoreValidadores: 92, risco: "CRITICAL" });
    expect(r.decision).toBe("ALLOW");
    const r2 = aplicarPolitica({ ...base, scoreValidadores: 92, penalidade: 15, risco: "CRITICAL" });
    expect(r2.decision).not.toBe("ALLOW");
  });
});

describe("motor completo com a política", () => {
  it("ferramenta quebrada nunca vira resposta ao paciente", () => {
    const r = decidirConfianca(
      ctx({ draftText: "Não temos horários", toolResults: [tool({ success: false, erro: "timeout" })] }),
    );
    expect(r.blockers).toContain("FERRAMENTA_FALHOU");
    expect(r.hardBlockers).toContain("TOOL_FAILURE_ON_CRITICAL_ACTION");
    expect(r.decision).toBe("HANDOFF");
  });

  it("fonte oficial ausente para preço bloqueia", () => {
    const r = decidirConfianca(ctx({ draftText: "O exame custa R$ 250" }));
    expect(r.hardBlockers).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
    expect(r.decision).toBe("HANDOFF");
  });

  it("fontes contraditórias transferem mesmo com o resto correto", () => {
    const r = decidirConfianca(
      ctx({
        draftText: "A consulta custa R$ 150",
        toolResults: [tool()],
        conflitos: [
          {
            campo: "preco_consulta",
            valores: [
              { origem: "catalogo", valor: "150" },
              { origem: "tabela_legada", valor: "180" },
            ],
          },
        ],
      }),
    );
    expect(r.hardBlockers).toContain("SOURCE_CONFLICT");
    expect(r.decision).toBe("HANDOFF");
    expect(r.score).toBe(0);
  });

  it("caminho limpo continua liberado", () => {
    const r = decidirConfianca(ctx({ draftText: "Oi! Como posso ajudar?" }));
    expect(r.score).toBe(100);
    expect(r.hardBlockers).toEqual([]);
    expect(r.decision).toBe("ALLOW");
  });
});
