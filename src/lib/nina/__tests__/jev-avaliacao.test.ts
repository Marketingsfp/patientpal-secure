import { describe, expect, it } from "bun:test";
import { DIMENSOES } from "../avaliador-sol";
import { interpretarAvaliacao, perguntasAvaliacao, precisaOpus } from "../jev-avaliacao";
import type { RespostaJev } from "../jev";

function respostas(nivel: string, critico = 0.02, alto = 0.03): Record<string, RespostaJev> {
  const r: Record<string, RespostaJev> = {};
  for (const d of DIMENSOES) r[`dim_${d.valor}`] = { choice: nivel, probabilities: { [nivel]: 1 }, confidence: 0.9 };
  r.erro_critico = { noul: critico };
  r.erro_alto = { noul: alto };
  return r;
}

describe("avaliação pelo Jev", () => {
  it("faz uma pergunta por dimensão mais os dois sinais graves", () => {
    expect(Object.keys(perguntasAvaliacao())).toHaveLength(DIMENSOES.length + 2);
  });
  it("aprova conversa ótima sem chamar o Opus", () => {
    const a = interpretarAvaliacao(respostas("otimo"));
    expect(a.score).toBe(100);
    expect(a.resultado).toBe("aprovado");
    expect(precisaOpus(a.resultado)).toBe(false);
  });
  it("reprova nota baixa ou erro alto e chama o Opus", () => {
    expect(interpretarAvaliacao(respostas("fraco")).resultado).toBe("reprovado");
    expect(interpretarAvaliacao(respostas("otimo", 0.02, 0.6)).resultado).toBe("reprovado");
    expect(precisaOpus("reprovado")).toBe(true);
  });
  it("erro crítico prevalece; sinal ausente nunca vira aprovação", () => {
    expect(interpretarAvaliacao(respostas("otimo", 0.7)).resultado).toBe("erro_critico");
    const r = respostas("otimo");
    delete r.erro_critico;
    expect(interpretarAvaliacao(r).resultado).toBe("erro_critico");
  });
  it("não aplicável fica sem nota", () => {
    const a = interpretarAvaliacao(respostas("nao_aplicavel"));
    expect(a.dimensoes.every((d) => d.nota === null)).toBe(true);
    expect(a.resultado).toBe("reprovado");
  });
});
