import { describe, expect, test } from "bun:test";
import { ehHtml, htmlDoProntuario, idadeCompleta, textoDoProntuario } from "./html";

describe("prontuario html", () => {
  test("texto puro passa direto", () => {
    expect(ehHtml("Paciente refere dor < 3 dias")).toBe(false);
    expect(textoDoProntuario("linha 1\nlinha 2")).toBe("linha 1\nlinha 2");
  });
  test("html vira texto legível", () => {
    expect(textoDoProntuario("<p><strong>Dor</strong> lombar</p><p>Melhora</p>")).toBe(
      "Dor lombar\nMelhora",
    );
  });
  test("texto vira html para o editor", () => {
    expect(htmlDoProntuario("a\nb")).toBe("<p>a</p><p>b</p>");
  });
  test("idade completa", () => {
    expect(idadeCompleta("1992-01-20", new Date(2025, 9, 1))).toBe("33 ANOS 8 MESES 11 DIAS");
    expect(idadeCompleta("2025-09-30", new Date(2025, 9, 1))).toBe("0 ANOS 0 MESES 1 DIA");
  });
});
