import { describe, expect, it } from "bun:test";
import {
  CATEGORIAS_RECUPERAVEIS,
  classificarErro,
  decidirRetry,
  mensagemCategoria,
} from "../erros";
import {
  agregarMetricas,
  motivoOperacional,
  MOTIVOS_OPERACIONAIS,
  rotuloHomologacao,
  sanitizarRegistro,
  type RegistroExecucao,
} from "../telemetria";

function registro(over: Partial<RegistroExecucao> = {}): RegistroExecucao {
  return {
    clinica_id: "c1",
    conversation_id: "conv1",
    perfil: "whatsapp",
    model: "google/gemini-3.7-flash",
    thinking_level: "low",
    route_reason: "simple_faq",
    latency_ms: 100,
    knowledge_status: null,
    tool_calls: [],
    success: true,
    error_category: null,
    handoff: false,
    input_tokens: 10,
    output_tokens: 5,
    retries: 0,
    ...over,
  };
}

describe("Fase 5 — classificação de erros", () => {
  it("separa timeout de erro do provedor", () => {
    expect(classificarErro({ erro: new Error("fetch failed: timeout") })).toBe("timeout");
    expect(classificarErro({ status: 500, erro: "boom" })).toBe("gemini_error");
    expect(classificarErro({ status: 429 })).toBe("provider_temporary");
    expect(classificarErro({ status: 402 })).toBe("provider_config");
    expect(classificarErro({ status: 400 })).toBe("bad_request");
  });

  it("separa erro da Base de informação ausente", () => {
    expect(classificarErro({ origem: "base", erro: "conexão caiu" })).toBe("knowledge_error");
    expect(classificarErro({ origem: "base", erro: "not_found" })).toBe("knowledge_not_found");
  });

  it("separa erro de ferramenta de regra de negócio", () => {
    expect(classificarErro({ origem: "ferramenta", erro: "500 interno" })).toBe("tool_error");
    expect(classificarErro({ origem: "ferramenta", erro: "conflito de horário" })).toBe(
      "business_rule",
    );
    expect(classificarErro({ origem: "regra", erro: "x" })).toBe("business_rule");
  });
});

describe("Fase 5 — política de retry", () => {
  it("repete somente o que é tecnicamente recuperável", () => {
    for (const c of CATEGORIAS_RECUPERAVEIS) {
      expect(decidirRetry(c, 1).repetir).toBe(true);
    }
    expect(decidirRetry("knowledge_not_found", 1).repetir).toBe(false);
    expect(decidirRetry("business_rule", 1).repetir).toBe(false);
    expect(decidirRetry("provider_config", 1).repetir).toBe(false);
    expect(decidirRetry("bad_request", 1).repetir).toBe(false);
  });

  it("não repete infinitamente", () => {
    expect(decidirRetry("timeout", 3).repetir).toBe(false);
    expect(decidirRetry("timeout", 1).esperaMs).toBeLessThanOrEqual(4000);
    expect(decidirRetry("timeout", 2).esperaMs).toBeGreaterThanOrEqual(
      decidirRetry("timeout", 1).esperaMs,
    );
  });

  it("respeita espera sugerida pelo provedor", () => {
    expect(decidirRetry("provider_temporary", 1, { retryAfterMs: 9000 }).esperaMs).toBe(9000);
  });

  it("tem mensagem em português para cada categoria", () => {
    expect(mensagemCategoria("knowledge_not_found")).toContain("Base de Conhecimentos");
    expect(mensagemCategoria("timeout")).toContain("demorou");
  });
});

describe("Fase 5 — telemetria sem chain-of-thought", () => {
  it("usa apenas motivos operacionais curtos da lista fechada", () => {
    const casos = [
      ["pergunta administrativa/factual direta", "low", "direct_knowledge_lookup"],
      ["assunto de agenda/disponibilidade", "medium", "appointment_tool_required"],
      ["agenda com múltiplas restrições", "medium", "multiple_constraints"],
      ["resultado conflitante ou falha de ferramenta no turno", "high", "conflicting_results"],
      ["padrão: pergunta simples", "low", "simple_faq"],
    ] as const;
    for (const [motivo, nivel, esperado] of casos) {
      const cod = motivoOperacional(motivo, nivel);
      expect(cod).toBe(esperado);
      expect(MOTIVOS_OPERACIONAIS).toContain(cod);
    }
  });

  it("descarta campos de raciocínio antes de gravar", () => {
    const limpo = sanitizarRegistro({
      model: "x",
      reasoning: "pensamento interno",
      reasoning_details: "cadeia",
      content: "mensagem do paciente",
      latency_ms: 12,
    });
    expect(limpo).toEqual({ model: "x", latency_ms: 12 });
  });

  it("etiqueta de homologação mostra modelo, nível, Base e tools", () => {
    expect(
      rotuloHomologacao({
        model: "google/gemini-3.7-flash",
        thinking_level: "medium",
        knowledge_status: "found",
        tool_calls: ["consultar_disponibilidade"],
      }),
    ).toBe(
      "Model: google/gemini-3.7-flash | Reasoning: MEDIUM | Knowledge: FOUND | Tools: consultar_disponibilidade",
    );
  });
});

describe("Fase 5 — métricas", () => {
  it("calcula percentuais, latência, tokens e contagens", () => {
    const m = agregarMetricas([
      registro(),
      registro({ thinking_level: "medium", latency_ms: 300, knowledge_status: "found", tool_calls: ["agendar"] }),
      registro({ thinking_level: "high", latency_ms: 900, knowledge_status: "not_found", handoff: true }),
      registro({ success: false, error_category: "timeout", retries: 2, knowledge_status: "conflict" }),
    ]);
    expect(m.total).toBe(4);
    expect(m.pct_low).toBe(50);
    expect(m.pct_medium).toBe(25);
    expect(m.pct_high).toBe(25);
    expect(m.latencia_media_ms).toBe(350);
    expect(m.latencia_p95_ms).toBe(900);
    expect(m.tokens_entrada).toBe(40);
    expect(m.tokens_saida).toBe(20);
    expect(m.consultas_base).toBe(3);
    expect(m.knowledge_not_found).toBe(1);
    expect(m.knowledge_conflict).toBe(1);
    expect(m.tool_calls).toBe(1);
    expect(m.handoffs).toBe(1);
    expect(m.retries).toBe(2);
    expect(m.erros).toBe(1);
    expect(m.erros_por_categoria["timeout"]).toBe(1);
  });

  it("conjunto vazio não quebra as métricas", () => {
    const m = agregarMetricas([]);
    expect(m.total).toBe(0);
    expect(m.pct_low).toBe(0);
    expect(m.latencia_p95_ms).toBe(0);
  });
});
