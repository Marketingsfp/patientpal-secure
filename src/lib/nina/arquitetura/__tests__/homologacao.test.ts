/**
 * FASE 10 — Execução de homologação na aba Arquitetura (testes puros).
 */
import { describe, expect, it } from "bun:test";
import {
  agregarCargaLuna,
  ehExecucaoHomologacao,
  montarPipelineHomologacao,
} from "../homologacao";
import type { EventoTrace } from "../tracing";

function evento(node: string, extra: Partial<EventoTrace> = {}): EventoTrace {
  return {
    trace_id: "t1",
    execution_id: "t1",
    conversation_id: null,
    message_id: null,
    cycle_id: 1,
    node_id: node,
    event_type: "completed",
    started_at: "2026-09-08T10:00:00.000Z",
    finished_at: "2026-09-08T10:00:01.000Z",
    duration_ms: 1000,
    status: "ok",
    metadata: {},
    ...extra,
  };
}

const execucaoTeste: EventoTrace[] = [
  evento("message.inbound", { metadata: { origem: "homologacao" } }),
  evento("context.load"),
  evento("prompt.compose"),
  evento("llm.generate"),
  evento("tool.schedule.availability"),
  evento("response.validate"),
  evento("message.outbound"),
];

describe("execução de homologação", () => {
  it("reconhece pela origem registrada no trace", () => {
    expect(ehExecucaoHomologacao(execucaoTeste)).toBe(true);
    expect(
      ehExecucaoHomologacao([evento("message.inbound", { metadata: { origem: "whatsapp" } })]),
    ).toBe(false);
  });

  it("mostra o caminho real e coloca o Sol como etapa posterior", () => {
    const p = montarPipelineHomologacao(execucaoTeste);
    expect(p.origem).toBe("homologacao");
    const geracao = p.fases.filter((f) => f.momento === "geracao").map((f) => f.id);
    expect(geracao).toEqual(["entrada", "contexto", "prompt", "conhecimento", "modelo", "tools", "resposta"]);
    const sol = p.fases.at(-1)!;
    expect(sol.id).toBe("avaliacao");
    expect(sol.momento).toBe("posterior");
    expect(sol.ocorreu).toBe(false);
  });

  it("não inventa etapa que não foi registrada", () => {
    const p = montarPipelineHomologacao([
      evento("message.inbound", { metadata: { origem: "homologacao" } }),
    ]);
    expect(p.fases.find((f) => f.id === "modelo")!.ocorreu).toBe(false);
    expect(p.fases.some((f) => f.id === "tools")).toBe(false);
    expect(p.ferramentas).toEqual([]);
  });

  it("marca falha quando alguma etapa falhou", () => {
    const p = montarPipelineHomologacao([
      ...execucaoTeste,
      evento("llm.generate", { status: "error", event_type: "failed" }),
    ]);
    expect(p.fases.find((f) => f.id === "modelo")!.status).toBe("error");
  });

  it("marca a avaliação do Sol quando ela já existe", () => {
    const p = montarPipelineHomologacao(execucaoTeste, { avaliacaoSol: true });
    expect(p.fases.at(-1)!.ocorreu).toBe(true);
  });

  it("agrega o teste de carga por lead, sem um componente por mensagem", () => {
    const a = agregarCargaLuna([
      { indice: 1, lead_indice: 1, status: "ok", latencia_ms: 1000 },
      { indice: 2, lead_indice: 1, status: "ok", latencia_ms: 2000 },
      { indice: 3, lead_indice: 2, status: "erro", erro: "timeout" },
    ]);
    expect(a.totalMensagens).toBe(3);
    expect(a.leads).toBe(2);
    expect(a.ok).toBe(2);
    expect(a.erros).toBe(1);
    expect(a.porLead[0]!.latenciaMediaMs).toBe(1500);
    expect(a.porLead[1]!.latenciaMediaMs).toBeNull();
    expect(a.porLead[0]!.amostras).toHaveLength(2);
  });
});
