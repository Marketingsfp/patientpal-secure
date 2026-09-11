/**
 * FASE 3 — leitura do registro do turno a partir dos eventos da execução.
 * Teste puro: sem banco, sem rede, sem render.
 */
import { describe, expect, it } from "bun:test";
import { resumoDoTurno, situacaoDasTransformacoes } from "../RegistroTurnoResumo";

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

describe("situacaoDasTransformacoes", () => {
  it("usa a situação gravada quando existe", () => {
    expect(situacaoDasTransformacoes({ situacao_transformacoes: "alterado" })).toBe("alterado");
  });

  it("registro antigo sem o campo é reclassificado pelos hashes gravados", () => {
    expect(
      situacaoDasTransformacoes({
        transformacoes: [{ etapa: "finalizacao", antes_hash: "t1:a:1", depois_hash: "t1:a:1" }],
      }),
    ).toBe("sem_alteracao");
    expect(
      situacaoDasTransformacoes({
        transformacoes: [{ etapa: "finalizacao", antes_hash: "t1:a:1", depois_hash: "t1:b:2" }],
      }),
    ).toBe("alterado");
  });

  it("sem transformações e sem hash", () => {
    expect(situacaoDasTransformacoes({})).toBe("sem_transformacoes");
    expect(situacaoDasTransformacoes({ transformacoes: [{ etapa: "x" }] })).toBe("indeterminado");
  });
});
