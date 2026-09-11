/**
 * FASE 4 — testes dos estados do rastreamento. Módulo puro.
 */
import { describe, expect, it } from "bun:test";
import { apresentarEstadoEvento, descreverEventoRastreio, estadoConhecido } from "./estado-evento";

describe("apresentarEstadoEvento", () => {
  it("ok é o único com ✔", () => {
    expect(apresentarEstadoEvento("ok").simbolo).toBe("✔");
    expect(apresentarEstadoEvento("ok").rotulo).toBe("concluída");
  });

  it("error aparece como falha", () => {
    const r = apresentarEstadoEvento("error");
    expect(r.simbolo).toBe("✖");
    expect(r.rotulo).toBe("falhou");
  });

  it("running não aparece como concluído", () => {
    const r = apresentarEstadoEvento("running");
    expect(r.simbolo).not.toBe("✔");
    expect(r.rotulo).toBe("em andamento");
  });

  it("skipped e cancelled não aparecem como sucesso", () => {
    for (const s of ["skipped", "cancelled"] as const) {
      const r = apresentarEstadoEvento(s);
      expect(r.simbolo).not.toBe("✔");
      expect(r.rotulo).not.toBe("concluída");
    }
  });

  it("estado desconhecido aparece como desconhecido, nunca como sucesso", () => {
    const r = apresentarEstadoEvento("erro");
    expect(r.simbolo).toBe("?");
    expect(r.rotulo).toBe("estado desconhecido");
    // o valor original é preservado, sem tradução inventada
    expect(r.original).toBe("erro");
  });

  it("estado ausente também é desconhecido", () => {
    expect(apresentarEstadoEvento(null).rotulo).toBe("estado desconhecido");
    expect(apresentarEstadoEvento(null).original).toBe("—");
  });

  it("estadoConhecido segue o contrato do tracing", () => {
    expect(estadoConhecido("ok")).toBe(true);
    expect(estadoConhecido("erro")).toBe(false);
  });
});

describe("descreverEventoRastreio", () => {
  it("evento de início não sugere execução concluída", () => {
    const r = descreverEventoRastreio({ event_type: "started", status: "running" });
    expect(r.simbolo).not.toBe("✔");
    expect(r.rotulo).toBe("início · em andamento");
  });

  it("início com status ok ainda é início, não conclusão", () => {
    const r = descreverEventoRastreio({ event_type: "started", status: "ok" });
    expect(r.simbolo).toBe("▸");
    expect(r.rotulo).toBe("início · concluída");
  });

  it("conclusão com sucesso mantém ✔", () => {
    expect(descreverEventoRastreio({ event_type: "completed", status: "ok" }).simbolo).toBe("✔");
  });
});
