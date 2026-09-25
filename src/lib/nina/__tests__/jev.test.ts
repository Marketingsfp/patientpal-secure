import { describe, expect, test } from "bun:test";
import { jevPermitido, validarRespostas, type PerguntaJev } from "../jev";

const perguntas: Record<string, PerguntaJev> = {
  intencao: { type: "choice", instructions: "x", criteria: { agendar: "a", outro: "b" } },
  humano: { type: "noul", instructions: "y" },
};

describe("Jev na Nina", () => {
  test("só vale em homologação com flag ligada", () => {
    expect(jevPermitido(true, true)).toBe(true);
    expect(jevPermitido(false, true)).toBe(false);
    expect(jevPermitido(true, false)).toBe(false);
  });
  test("aceita respostas completas", () => {
    const r = validarRespostas(perguntas, { answers: { intencao: { choice: "agendar", confidence: 0.9 }, humano: { noul: 0.1 } } });
    expect(r?.["intencao"]?.choice).toBe("agendar");
  });
  test("recusa resposta faltando ou opção desconhecida (sem decisão)", () => {
    expect(validarRespostas(perguntas, { answers: { intencao: { choice: "agendar" } } })).toBeNull();
    expect(validarRespostas(perguntas, { answers: { intencao: { choice: "xyz" }, humano: { noul: 0.1 } } })).toBeNull();
    expect(validarRespostas(perguntas, null)).toBeNull();
  });
});
