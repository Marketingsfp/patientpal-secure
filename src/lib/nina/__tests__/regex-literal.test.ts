import { describe, expect, test } from "bun:test";
import { literalRegex } from "../regex-literal";
import { escolhaParaAgendar } from "../fluxo-agendamento-item";

// Homologação 15/10/2026: 7 turnos falharam com "Invalid regular expression:
// Unterminated group" — nome do catálogo com parênteses ("EAS (URINA TIPO I)").
describe("nomes do catálogo com parênteses", () => {
  test("a escolha não derruba o turno e continua reconhecendo o item", () => {
    const nomes = ["EAS (URINA TIPO I)", "TC MEMBROS (CADA LADO)", "CURATIVO (COM MATERIAL)"];
    expect(() => escolhaParaAgendar("quero fazer na quinta de manha", nomes)).not.toThrow();
    expect(
      escolhaParaAgendar("pode ser com a eneida na quinta", ["ENEIDA (TESTE) RODRIGUES"]),
    ).toBe(true);
  });

  test("o texto vira literal", () => {
    expect(new RegExp(literalRegex("(urina")).test("exame (urina tipo i)")).toBe(true);
    expect(new RegExp(literalRegex("a.b*c")).test("axbbc")).toBe(false);
    expect(new RegExp(literalRegex("a.b*c")).test("a.b*c")).toBe(true);
  });
});
