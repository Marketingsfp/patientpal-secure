import { describe, expect, it } from "vitest";
import {
  classificarFalha,
  diagnosticarExecucao,
  horaDoInstante,
  levantarFalhas,
  montarEntradaSaida,
  montarTimeline,
} from "../timeline";
import type { EventoTrace } from "../tracing";

function evento(p: Partial<EventoTrace> & { node_id: string }): EventoTrace {
  return {
    trace_id: "t1",
    execution_id: "e1",
    conversation_id: "c1",
    message_id: "m1",
    cycle_id: 1,
    event_type: "completed",
    started_at: "2026-09-06T19:32:01.100Z",
    finished_at: "2026-09-06T19:32:01.150Z",
    duration_ms: 50,
    status: "ok",
    metadata: {},
    ...p,
  };
}

describe("timeline", () => {
  it("ordena os marcos e usa apenas timestamps registrados", () => {
    const marcos = montarTimeline([
      evento({ node_id: "message.outbound", started_at: "2026-09-06T19:32:03.810Z", finished_at: "2026-09-06T19:32:03.900Z" }),
      evento({ node_id: "message.inbound", event_type: "started", started_at: "2026-09-06T19:32:01.102Z", finished_at: null }),
    ]);
    expect(marcos.map((m) => m.nodeId)).toEqual(["message.inbound", "message.outbound"]);
    expect(marcos[0]!.horaExibida).toBe("19:32:01.102");
  });

  it("não fabrica milissegundos quando o registro não tem", () => {
    expect(horaDoInstante("2026-09-06T19:32:01Z")).toBe("19:32:01");
  });
});

describe("entrada e saída", () => {
  it("descreve o caminho paciente → backend → IA → tools → resposta", () => {
    const es = montarEntradaSaida([
      evento({ node_id: "message.inbound", metadata: { mensagem: "Quero marcar limpeza" } }),
      evento({ node_id: "context.load" }),
      evento({ node_id: "llm.generate" }),
      evento({ node_id: "tool.schedule.availability" }),
      evento({ node_id: "message.outbound", metadata: { resposta: "Tenho 3 horários" } }),
    ]);
    expect(es.mensagemOriginal).toBe("Quero marcar limpeza");
    expect(es.respostaFinal).toBe("Tenho 3 horários");
    expect(es.entregue).toBe(true);
    expect(es.jornada.every((e) => e.ocorreu)).toBe(true);
  });

  it("marca etapas não ocorridas quando não houve IA nem tool", () => {
    const es = montarEntradaSaida([evento({ node_id: "message.inbound" })]);
    expect(es.entregue).toBe(false);
    expect(es.jornada.find((e) => e.rotulo === "IA")!.ocorreu).toBe(false);
  });
});

describe("classificação de erros", () => {
  it("separa os tipos de falha", () => {
    expect(classificarFalha("tool.schedule.availability", "error", "Timeout ao consultar")).toBe("timeout");
    expect(classificarFalha("message.outbound", "error", "HTTP 502 na Meta")).toBe("integracao");
    expect(classificarFalha("llm.generate", "error", "modelo indisponível no gateway")).toBe("modelo");
    expect(classificarFalha("tool.schedule.book", "error", "Sem vaga para o horário")).toBe("negocio");
    expect(classificarFalha("context.load", "cancelled", null)).toBe("cancelamento");
    expect(classificarFalha("context.load", "error", "TypeError inesperado")).toBe("tecnico");
  });

  it("respeita o tipo informado no metadata", () => {
    expect(classificarFalha("context.load", "error", "qualquer", "negocio")).toBe("negocio");
  });
});

describe("falhas e tentativas", () => {
  const eventos: EventoTrace[] = [
    evento({ node_id: "message.inbound", event_type: "started", finished_at: null }),
    evento({
      node_id: "tool.schedule.availability",
      event_type: "failed",
      status: "error",
      started_at: "2026-09-06T19:32:02.000Z",
      finished_at: "2026-09-06T19:32:02.500Z",
      metadata: { erro: "Timeout ao consultar agenda" },
    }),
    evento({
      node_id: "tool.schedule.availability",
      event_type: "retry",
      status: "error",
      started_at: "2026-09-06T19:32:02.600Z",
      metadata: { erro: "Timeout ao consultar agenda" },
    }),
    evento({
      node_id: "tool.schedule.availability",
      status: "ok",
      started_at: "2026-09-06T19:32:03.000Z",
    }),
    evento({ node_id: "message.outbound", started_at: "2026-09-06T19:32:03.810Z", status: "ok" }),
  ];

  it("agrupa tentativas, tipo e recuperação", () => {
    const [falha] = levantarFalhas(eventos);
    expect(falha!.totalTentativas).toBe(2);
    expect(falha!.tipo).toBe("timeout");
    expect(falha!.recuperado).toBe(true);
  });

  it("aponta sucesso apesar de falha intermediária", () => {
    const d = diagnosticarExecucao(eventos);
    expect(d.resultadoFinal).toBe("entregue");
    expect(d.sucessoComFalhaIntermediaria).toBe(true);
    expect(d.duracaoTotalMs).toBeGreaterThan(0);
  });

  it("registra fallback acionado", () => {
    const falhas = levantarFalhas([
      evento({ node_id: "message.outbound", status: "error", metadata: { erro: "falha no envio de áudio" } }),
      evento({ node_id: "audio.fallback", started_at: "2026-09-06T19:32:04.000Z" }),
    ]);
    expect(falhas[0]!.fallback).toBeTruthy();
  });

  it("classifica execução cancelada", () => {
    const d = diagnosticarExecucao([
      evento({ node_id: "message.inbound" }),
      evento({ node_id: "llm.generate", event_type: "cancelled", status: "cancelled", started_at: "2026-09-06T19:32:02.000Z" }),
    ]);
    expect(d.resultadoFinal).toBe("cancelado");
    expect(d.falhas[0]!.tipo).toBe("cancelamento");
  });

  it("não expõe segredos vindos do metadata", () => {
    const falhas = levantarFalhas([
      evento({
        node_id: "message.outbound",
        status: "error",
        metadata: { erro: "falha", api_key: "sk-123", token: "abc" },
      }),
    ]);
    expect(JSON.stringify(falhas)).not.toContain("sk-123");
  });
});
