/**
 * FASE 7 — gate de validação do Confidence Engine v2.
 * Todos os testes são determinísticos: nenhum modelo, banco ou rede.
 */
import { describe, expect, it } from "bun:test";
import {
  CASOS_GATE_V2,
  compararShadow,
  criteriosDeConfianca,
  executarGateV2,
  resumoComparacaoShadow,
  resumoGateV2,
  verificarCaso9TextoTrocado,
  verificarConfiancaRunner,
} from "./gate-v2";
import { VERSAO_MOTOR, ehVersaoMotorHistorica } from "./policy";

describe("gate v2 — 10 casos obrigatórios", () => {
  const linhas = executarGateV2();

  it("cobre os 10 casos e todos passam", () => {
    const resumo = resumoGateV2(linhas);
    expect(resumo.total).toBe(10);
    expect(resumo.fail).toBe(0);
  });

  it("em shadow nada interfere na resposta", () => {
    expect(resumoGateV2(linhas).interferiu).toBe(0);
  });

  for (const c of CASOS_GATE_V2) {
    it(`caso ${c.id}: ${c.esperado}`, () => {
      const linha = linhas.find((l) => l.id === c.id);
      expect(linha?.status).toBe("PASS");
    });
  }

  it("caso 9: score do texto A nunca vale para o texto B", () => {
    expect(verificarCaso9TextoTrocado().status).toBe("PASS");
  });

  it("handoff não produz answer confidence 100", () => {
    const l = linhas.find((x) => x.id === "10-handoff-nao-e-confianca");
    expect(l?.score).toBeLessThan(100);
  });

  it("ausência de evidência nunca vira 100", () => {
    const l = linhas.find((x) => x.id === "8-tudo-desconhecido");
    expect(l?.score).toBeLessThan(100);
  });
});

describe("versão do motor", () => {
  it("registra Confidence Engine v2 e preserva leitura de versões antigas", () => {
    expect(VERSAO_MOTOR).toBe("confidence-v2");
    expect(ehVersaoMotorHistorica("engine-v6")).toBe(true);
    expect(ehVersaoMotorHistorica(null)).toBe(true);
    expect(ehVersaoMotorHistorica(VERSAO_MOTOR)).toBe(false);
  });
});

describe("comparação shadow v1 x v2", () => {
  const snaps = [
    {
      outgoing_message_id: "m1",
      engine_version: "engine-v6",
      score: 100,
      evidence_coverage: 40,
      resultado_final: "ALLOW",
    },
    {
      outgoing_message_id: "m1",
      engine_version: "confidence-v2",
      score: 62,
      evidence_coverage: 40,
      resultado_final: "CLARIFY",
      erro_confirmado: false,
    },
    // Sem identificador exato: não pode ser comparado por conversa.
    { engine_version: "confidence-v2", score: 90 },
  ];

  it("cruza somente pela mesma mensagem", () => {
    const linhas = compararShadow(snaps, "confidence-v2");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.delta).toBe(-38);
    expect(linhas[0]?.mudouDecisao).toBe(true);
  });

  it("resume erros confirmados em alta confiança", () => {
    const linhas = compararShadow(
      [
        { message_id: "m9", engine_version: "engine-v6", score: 100 },
        {
          message_id: "m9",
          engine_version: "confidence-v2",
          score: 95,
          erro_confirmado: true,
        },
      ],
      "confidence-v2",
    );
    expect(resumoComparacaoShadow(linhas).altaConfiancaComErro).toBe(1);
  });
});

describe("assertions do Test Runner", () => {
  it("reprova score 100 sem cobertura total", () => {
    const v = verificarConfiancaRunner([
      { score: 100, nivel: "HIGH", evidence_coverage: 40, outgoing_message_id: "m1" },
    ]);
    expect(v.no_score_100_without_evidence).toBe(false);
  });

  it("reprova alta confiança com bloqueador", () => {
    const v = verificarConfiancaRunner([
      {
        score: 92,
        nivel: "HIGH",
        evidence_coverage: 100,
        bloqueadores: ["UNGROUNDED_CLAIM"],
        outgoing_message_id: "m1",
      },
    ]);
    expect(v.no_high_with_blocker).toBe(false);
  });

  it("reprova snapshot sem vínculo com a mensagem enviada", () => {
    const v = verificarConfiancaRunner([{ score: 80, nivel: "MEDIUM", evidence_coverage: 90 }]);
    expect(v.confidence_linked_to_message).toBe(false);
  });

  // FASE 8 — contrato novo (exigência AUMENTADA, não reduzida): além das 4
  // invariantes originais, o runner confere correspondência com as saídas
  // esperadas, tipo de avaliação, nota/nível, versão de política, escopo
  // (clínica/conversa), execução e hash do texto entregue. São 12 critérios.
  it("aprova snapshot íntegro e gera critérios legíveis", () => {
    const v = verificarConfiancaRunner(
      [
        {
          score: 88,
          nivel: "MEDIUM",
          evidence_coverage: 95,
          outgoing_message_id: "m1",
          policy_version: "v5",
          avaliacao: "answer_confidence",
          clinica_id: "cli-1",
          conversation_id: "conv-1",
          execucao_id: "ex-1",
          texto_final_hash: "t1:abc:10",
        },
      ],
      [{ id: "m1", execucao_id: "ex-1", texto_hash: "t1:abc:10" }],
      { clinicaId: "cli-1", conversaId: "conv-1" },
    );
    const criterios = criteriosDeConfianca(v);
    expect(criterios).toHaveLength(12);
    expect(criterios.every((c) => c.ok)).toBe(true);
  });
});

