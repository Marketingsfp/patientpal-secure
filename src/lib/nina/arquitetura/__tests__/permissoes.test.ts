import { describe, expect, it } from "bun:test";
import {
  CAPACIDADES_ARQUITETURA,
  capacidadesDoPapel,
  nivelAcessoDe,
  podeArquitetura,
} from "../permissoes";
import { estadosPorNode } from "../timeline";
import type { EventoTrace } from "../tracing";

describe("permissões do módulo Arquitetura", () => {
  it("admin recebe todas as capacidades", () => {
    expect(capacidadesDoPapel("admin").sort()).toEqual([...CAPACIDADES_ARQUITETURA].sort());
    expect(nivelAcessoDe(capacidadesDoPapel("admin"))).toBe("admin");
  });

  it("gestor e supervisor veem mapa e execução, mas não código nem instruções", () => {
    for (const papel of ["gestor", "supervisor"]) {
      const c = capacidadesDoPapel(papel);
      expect(podeArquitetura(c, "arquitetura.visualizar")).toBe(true);
      expect(podeArquitetura(c, "arquitetura.execucao")).toBe(true);
      expect(podeArquitetura(c, "arquitetura.codigo")).toBe(false);
      expect(podeArquitetura(c, "arquitetura.instrucoes")).toBe(false);
      expect(nivelAcessoDe(c)).toBe("operacional");
    }
  });

  it("atendimento comum não recebe nada automaticamente", () => {
    for (const papel of ["recepcao", "caixa", "financeiro", "medico", "enfermeiro", null]) {
      expect(capacidadesDoPapel(papel)).toEqual([]);
    }
  });
});

function evento(p: Partial<EventoTrace> & { node_id: string }): EventoTrace {
  return {
    trace_id: "t",
    execution_id: "e",
    conversation_id: "c",
    message_id: "m",
    cycle_id: 1,
    event_type: "completed",
    started_at: "2026-09-06T19:00:00.000Z",
    finished_at: "2026-09-06T19:00:00.100Z",
    duration_ms: 100,
    status: "ok",
    metadata: {},
    ...p,
  };
}

describe("estados dos nodes no canvas", () => {
  it("marca executado, falhou e retry na ordem real", () => {
    const estados = estadosPorNode([
      evento({ node_id: "message.inbound" }),
      evento({
        node_id: "tool.schedule.availability",
        status: "error",
        started_at: "2026-09-06T19:00:01.000Z",
        metadata: { erro: "Timeout" },
      }),
      evento({
        node_id: "tool.schedule.availability",
        status: "ok",
        started_at: "2026-09-06T19:00:02.000Z",
      }),
    ]);
    expect(estados["message.inbound"]!.status).toBe("executado");
    expect(estados["tool.schedule.availability"]!.status).toBe("retry");
    expect(estados["tool.schedule.availability"]!.tentativas).toBe(1);
  });

  it("não vaza segredos vindos do metadata", () => {
    const estados = estadosPorNode([
      evento({ node_id: "llm.generate", metadata: { api_key: "sk-xyz", modelo: "google/gemini" } }),
    ]);
    expect(JSON.stringify(estados)).not.toContain("sk-xyz");
    expect(JSON.stringify(estados)).toContain("gemini");
  });

  it("nodes não percorridos ficam fora do mapa (apagados no canvas)", () => {
    const estados = estadosPorNode([evento({ node_id: "message.inbound" })]);
    expect(estados["tool.handoff"]).toBeUndefined();
  });
});
