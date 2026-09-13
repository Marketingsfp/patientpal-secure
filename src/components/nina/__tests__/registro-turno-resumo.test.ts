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

describe("nota no painel técnico da mensagem (regressão MJ-54)", () => {
  const bloqueada = {
    avaliacao: "answer_confidence",
    score: 63,
    nivel: "LOW",
    decisao: "HANDOFF",
    modo: "enforce",
    textoHash: "hash-candidato",
    decisaoId: "decisao-bloqueio",
  };
  const renderizar = (metadata: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(RegistroTurnoResumo, {
        compacto: true,
        eventos: [{ node_id: "turn.summary", metadata }],
      }),
    );

  it("aviso operacional preserva LOW 63 como evidência do bloqueio, sem atribuí-la à saída", () => {
    const html = renderizar({
      confianca: bloqueada,
      nota_do_texto_entregue: {
        aplicavel: false,
        motivo: "aviso_operacional_nao_avaliado",
        avaliacao: null,
      },
      bloqueios: [{ ...bloqueada, textoAvaliadoHash: bloqueada.textoHash }],
    });
    expect(html).toContain("Mensagem operacional do sistema: não recebeu nota do motor");
    expect(html).toContain(
      "Avaliação do texto bloqueado (não é a nota da mensagem entregue) · nota 63",
    );
    expect(html).not.toContain("Confiança da mensagem final");
  });

  it("mantém o rótulo final para a avaliação do mesmo conteúdo entregue", () => {
    const valida = { ...bloqueada, score: 89, nivel: "MEDIUM", textoHash: "hash-final" };
    const html = renderizar({
      avaliacoes: [valida],
      entrega: { mensagemId: "mensagem-final", textoHash: "hash-final" },
      nota_do_texto_entregue: { aplicavel: true, motivo: "hash_confere", avaliacao: valida },
    });
    expect(html).toContain("Confiança da mensagem final · nota 89");
  });

  it("distingue o candidato bloqueado da avaliação da versão corrigida no mesmo turno", () => {
    const corrigida = {
      ...bloqueada,
      score: 95,
      nivel: "HIGH",
      decisao: "ANSWER",
      decisaoId: "decisao-corrigida",
      textoHash: "hash-corrigido",
    };
    const html = renderizar({
      avaliacoes: [bloqueada, corrigida],
      entrega: { mensagemId: "mensagem-corrigida", textoHash: corrigida.textoHash },
      nota_do_texto_entregue: { aplicavel: true, motivo: "hash_confere", avaliacao: corrigida },
      bloqueios: [{ ...bloqueada, textoAvaliadoHash: bloqueada.textoHash }],
    });
    expect(html).toContain(
      "Avaliação do texto bloqueado (não é a nota da mensagem entregue) · nota 63",
    );
    expect(html).toContain("Confiança da mensagem final · nota 95");
    expect(html).not.toContain("Confiança da mensagem final · nota 63");
  });

  it("registro antigo incompleto conserva a nota sem inventar o vínculo com a saída", () => {
    const html = renderizar({ confianca: { ...bloqueada, textoHash: null, decisaoId: null } });
    expect(html).toContain(
      "Avaliação registrada no turno (nota não vinculada à mensagem entregue) · nota 63",
    );
    expect(html).not.toContain("Confiança da mensagem final");
  });

  it("não converte a avaliação de segurança da ação em confiança do texto", () => {
    const html = renderizar({ confianca: { ...bloqueada, avaliacao: "action_safety" } });
    expect(html).toContain("Segurança da ação (operacional) · nota 63");
    expect(html).not.toContain("Confiança da mensagem final");
  });

  it("hash divergente impede atribuição final mesmo com identificador de avaliação igual", () => {
    const html = renderizar({
      avaliacoes: [bloqueada],
      entrega: { textoHash: "outro-texto" },
      nota_do_texto_entregue: { aplicavel: true, motivo: "hash_confere", avaliacao: bloqueada },
    });
    expect(html).not.toContain("Confiança da mensagem final");
    expect(html).toContain("nota 63");
  });
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
