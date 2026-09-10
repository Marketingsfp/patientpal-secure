/**
 * FASE 3 — leitura do registro do turno a partir dos eventos da execução.
 * Teste puro: sem banco, sem rede, sem render.
 */
import { describe, expect, it } from "bun:test";
import { resumoDoTurno } from "../RegistroTurnoResumo";

describe("resumoDoTurno", () => {
  it("devolve o metadata do evento turn.summary", () => {
    const r = resumoDoTurno([
      { node_id: "model.call", metadata: { x: 1 } },
      { node_id: "turn.summary", metadata: { origem_resposta: "modelo" } },
    ]);
    expect(r?.["origem_resposta"]).toBe("modelo");
  });

  it("sem o evento, não inventa registro (lacuna declarada)", () => {
    expect(resumoDoTurno([{ node_id: "model.call", metadata: { x: 1 } }])).toBeNull();
  });

  it("ignora metadata que não é objeto", () => {
    expect(resumoDoTurno([{ node_id: "turn.summary", metadata: "texto" }])).toBeNull();
  });
});
