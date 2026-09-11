/**
 * FASE 3 — leitura do registro do turno a partir dos eventos da execução.
 * Teste puro: sem banco, sem rede, sem render.
 */
import { describe, expect, it } from "bun:test";
import {
  eventosDeSaidaDoTurno,
  resumoDoTurno,
  situacaoDasTransformacoes,
} from "../RegistroTurnoResumo";

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

describe("eventosDeSaidaDoTurno (FASE 3)", () => {
  const alvo = { turnoId: "t1", execucaoId: "e1", conversaId: "c1" };

  it("aceita o evento de saída do próprio turno", () => {
    const r = eventosDeSaidaDoTurno(
      [
        { node_id: "turn.summary", metadata: {} },
        {
          node_id: "turn.delivery",
          metadata: {
            turno_id: "t1",
            execucao_id: "e1",
            conversa_id: "c1",
            outgoing_message_id: "m1",
            canal: "test-console",
            estado: "persistida",
          },
        },
      ],
      alvo,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.mensagemId).toBe("m1");
  });

  it("não associa evento de outro turno nem de outra conversa", () => {
    const outros = eventosDeSaidaDoTurno(
      [
        { node_id: "turn.delivery", metadata: { turno_id: "t2", outgoing_message_id: "x" } },
        {
          node_id: "turn.delivery",
          metadata: { turno_id: "t1", conversa_id: "c9", outgoing_message_id: "y" },
        },
      ],
      alvo,
    );
    expect(outros).toHaveLength(0);
  });
});
