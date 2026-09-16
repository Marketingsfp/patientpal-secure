/**
 * FASE 3 — leitura do registro do turno a partir dos eventos da execução.
 * Sem banco nem rede; inclui renderização estática do painel de confiança.
 */
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RegistroTurnoResumo,
  eventosDeSaidaDoTurno,
  resumoDoTurno,
  situacaoDasTransformacoes,
} from "../RegistroTurnoResumo";

describe("resumo sem motor de confiança", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    it(`${ambiente}: preserva prompt e entrega sem exibir avaliações antigas`, () => {
      const metadata = {
        ambiente, origem_resposta: "modelo", modelo_chamado: true, rodadas: 1,
        versao_prompt: { versao: 6, selecao: "publicada" },
        entrega: { mensagemId: "mensagem-final", textoHash: "hash-final", tamanho: 20 },
        confianca: { avaliacao: "answer_confidence", score: 63, nivel: "LOW", decisao: "HANDOFF" },
        avaliacoes: [{ avaliacao: "answer_confidence", score: 63, nivel: "LOW", decisao: "HANDOFF" }],
        lacunas: ["confianca"],
      };
      const html = renderToStaticMarkup(createElement(RegistroTurnoResumo, {
        compacto: true, eventos: [{ node_id: "turn.summary", metadata }],
      }));
      expect(html).toContain("mensagem-final");
      expect(html).toContain("versão 6");
      expect(html).toContain(ambiente);
      expect(html).not.toContain("Avaliações de confiança");
      expect(html).not.toContain("HANDOFF");
      expect(html).not.toContain("nota 63");
      expect(html).not.toContain("Política de confiança não registrada");
      expect(metadata.avaliacoes[0]?.score).toBe(63);
    });
  }
});

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
