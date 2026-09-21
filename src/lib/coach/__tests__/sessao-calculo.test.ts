import { describe, expect, it } from "bun:test";
import {
  aplicarResposta,
  corrigirProva,
  duracaoSegundos,
  notaValida,
  sanitizarQuestoes,
  treinoExpirado,
  type QuestaoCompleta,
} from "@/lib/coach/sessao-calculo";

function questao(correta: number, alternativas = 4): QuestaoCompleta {
  return {
    pergunta: "Como responder ao paciente?",
    alternativas: Array.from({ length: alternativas }, (_, i) => `Alternativa ${i}`),
    correta,
    explicacao: "Porque sim.",
    origem: "manual",
  };
}

describe("prova — o gabarito nunca chega ao navegador", () => {
  it("sanitizarQuestoes remove resposta correta e explicação", () => {
    const seguras = sanitizarQuestoes([questao(2), questao(0)]);
    for (const q of seguras) {
      expect(q).not.toHaveProperty("correta");
      expect(q).not.toHaveProperty("explicacao");
      expect(q.alternativas.length).toBe(4);
    }
    // e o texto entregue continua sendo o mesmo da questão original
    expect(seguras[0]?.pergunta).toBe("Como responder ao paciente?");
    expect(JSON.stringify(seguras)).not.toContain("Porque sim.");
  });
});

describe("corrigirProva (finalizarProva)", () => {
  it("conta acertos e dá nota de 0 a 10 com uma casa", () => {
    const questoes = [questao(1), questao(2), questao(0)];
    expect(corrigirProva(questoes, [1, 2, 0])).toEqual({ acertos: 3, total: 3, nota: 10 });
    expect(corrigirProva(questoes, [1, 0, 0])).toEqual({ acertos: 2, total: 3, nota: 6.7 });
    expect(corrigirProva(questoes, [3, 3, 3])).toEqual({ acertos: 0, total: 3, nota: 0 });
  });

  it("questão não respondida não vira acerto", () => {
    const questoes = [questao(1), questao(2)];
    const r = corrigirProva(questoes, [-1, 2]);
    expect(r.acertos).toBe(1);
    expect(r.nota).toBe(5);
  });

  it("prova sem questões não quebra a nota", () => {
    expect(corrigirProva([], [])).toEqual({ acertos: 0, total: 0, nota: 0 });
  });
});

describe("aplicarResposta", () => {
  it("guarda a resposta na posição certa e mantém as anteriores", () => {
    const a = aplicarResposta(null, 0, 2, 3, 4);
    expect(a).toEqual([2, -1, -1]);
    expect(aplicarResposta(a, 2, 1, 3, 4)).toEqual([2, -1, 1]);
  });

  it("descarta lixo vindo do navegador", () => {
    expect(aplicarResposta(["x", 1.5, 3], 0, 0, 3, 4)).toEqual([0, -1, 3]);
  });

  it("recusa índice de questão fora da prova", () => {
    expect(() => aplicarResposta([], 5, 0, 3, 4)).toThrow("Questão inválida.");
    expect(() => aplicarResposta([], -1, 0, 3, 4)).toThrow("Questão inválida.");
  });

  it("recusa alternativa que não existe na questão", () => {
    expect(() => aplicarResposta([], 0, 9, 3, 4)).toThrow("Alternativa inválida.");
    expect(() => aplicarResposta([], 0, -2, 3, 4)).toThrow("Alternativa inválida.");
  });
});

describe("treino — duração e nota medidas no servidor (encerrarTreino)", () => {
  const inicio = "2026-09-21T13:00:00.000Z";

  it("calcula a duração pelo relógio do servidor", () => {
    expect(duracaoSegundos(inicio, new Date("2026-09-21T13:05:30.000Z"))).toBe(330);
  });

  it("nunca grava duração zero, negativa ou acima de 2 horas", () => {
    expect(duracaoSegundos(inicio, new Date("2026-09-21T13:00:00.000Z"))).toBe(1);
    expect(duracaoSegundos(inicio, new Date("2026-09-21T12:50:00.000Z"))).toBe(1);
    expect(duracaoSegundos(inicio, new Date("2026-09-21T20:00:00.000Z"))).toBe(7200);
  });

  it("data inválida não derruba o encerramento", () => {
    expect(duracaoSegundos("não é data")).toBe(1);
  });

  it("nota fica sempre entre 0 e 10, com uma casa", () => {
    expect(notaValida(8.46)).toBe(8.5);
    expect(notaValida(99)).toBe(10);
    expect(notaValida(-4)).toBe(0);
    expect(notaValida("7.2")).toBe(7.2);
    expect(notaValida(undefined)).toBe(0);
    expect(notaValida("dez")).toBe(0);
  });

  it("sessão parada há mais de 2 horas é considerada expirada", () => {
    expect(treinoExpirado(inicio, new Date("2026-09-21T14:59:00.000Z"))).toBe(false);
    expect(treinoExpirado(inicio, new Date("2026-09-21T15:01:00.000Z"))).toBe(true);
    expect(treinoExpirado("não é data")).toBe(false);
  });
});
