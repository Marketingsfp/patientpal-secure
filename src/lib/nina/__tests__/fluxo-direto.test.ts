import { describe, expect, it } from "bun:test";
import { registrosSemMotor } from "../fluxo-direto";

describe("detalhes sem motor de confiança", () => {
  it("omite avaliações e etapas antigas preservando prompt, conteúdo e entrega sem mutar o histórico", () => {
    const registros: Array<{ node_id: string; metadata: Record<string, unknown> }> = [
      { node_id: "confidence.decision", metadata: { score: 20 } },
      { node_id: "answer.verify", metadata: { score: 65 } },
      { node_id: "answer.rule_block", metadata: { motivo: "regra" } },
      { node_id: "llm.generate", metadata: { nivel: "low", modelo: "modelo-usado" } },
      { node_id: "turn.summary", metadata: {
        versao_prompt: { versao: 6 }, confianca: { score: 65 }, avaliacoes: [{ score: 65 }],
        nota_do_texto_entregue: { aplicavel: false }, lacunas: ["confianca", "mensagem_entregue"],
        entrega: { mensagemId: "saida", textoHash: "hash" },
      } },
      { node_id: "turn.delivery", metadata: { outgoing_message_id: "saida", estado: "confirmada" } },
    ];
    const original = structuredClone(registros);
    const visiveis = registrosSemMotor(registros);
    expect(visiveis.map((r) => r.node_id)).toEqual(["llm.generate", "turn.summary", "turn.delivery"]);
    expect(visiveis[0]?.metadata.nivel).toBe("low");
    expect(visiveis[1]?.metadata).toEqual({
      versao_prompt: { versao: 6 }, lacunas: ["mensagem_entregue"],
      entrega: { mensagemId: "saida", textoHash: "hash" },
    });
    expect(registros).toEqual(original);
  });
  it("não altera o texto do paciente, do prompt ou do modelo", () => {
    const texto = 'A palavra confiança e o número 65 fazem parte do conteúdo. {"score": 65}';
    const [visivel] = registrosSemMotor([{ dados: { mensagens: [{ role: "user", content: texto }] } }]);
    expect(visivel?.dados.mensagens[0]?.content).toBe(texto);
  });
});
