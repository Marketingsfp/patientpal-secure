import { describe, expect, test } from "bun:test";
import { intencaoAplicavel, estadoIntencao } from "../jev-intencao";

describe("Jev Fase 1 — intenção", () => {
  test("aplica com confiança alta", () => {
    expect(intencaoAplicavel({ choice: "agendamento", confidence: 0.95 })).toBe("agendamento");
  });
  test("ignora confiança baixa, 'outro', opção desconhecida ou sem confiança", () => {
    expect(intencaoAplicavel({ choice: "agendamento", confidence: 0.5 })).toBeNull();
    expect(intencaoAplicavel({ choice: "outro", confidence: 1 })).toBeNull();
    expect(intencaoAplicavel({ choice: "xyz", confidence: 1 })).toBeNull();
    expect(intencaoAplicavel({ choice: "valor" })).toBeNull();
    expect(intencaoAplicavel(undefined)).toBeNull();
  });
  test("limita o contexto às 6 últimas mensagens", () => {
    const ant = Array.from({ length: 10 }, (_, i) => ({ de: "paciente", texto: String(i) }));
    expect(estadoIntencao("oi", ant).mensagens_anteriores).toHaveLength(6);
  });
});
