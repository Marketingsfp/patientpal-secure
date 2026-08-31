import { describe, expect, it } from "bun:test";
import { documentoTomadorValido, problemaNoDocumentoDoTomador } from "./nfse-tomador";

describe("documentoTomadorValido", () => {
  it("aceita CPF e CNPJ completos, com ou sem pontuação", () => {
    for (const d of ["03335203780", "033.352.037-80", "31919483000318", "31.919.483/0003-18"]) {
      expect(documentoTomadorValido(d)).toBe(true);
    }
  });

  it("recusa vazio, nulo e documento incompleto", () => {
    for (const d of ["", "   ", null, undefined, "0333520378", "319194830003181"]) {
      expect(documentoTomadorValido(d)).toBe(false);
    }
  });
});

describe("problemaNoDocumentoDoTomador", () => {
  it("não reclama de documento válido", () => {
    expect(problemaNoDocumentoDoTomador("ADRIANA PAULA DOS SANTOS", "03335203780")).toBeNull();
  });

  it("manda cadastrar o CPF quando não há documento nenhum", () => {
    // O caso real de 31/08/2026: paciente sem CPF na ficha.
    const msg = problemaNoDocumentoDoTomador("VICTORIA ALVES DE OLIVEIRA", "");
    expect(msg).toContain("VICTORIA ALVES DE OLIVEIRA");
    expect(msg).toContain("sem CPF no cadastro");
  });

  it("diz quantos dígitos faltam quando o documento está pela metade", () => {
    const msg = problemaNoDocumentoDoTomador("GUSTAVO SANTOS DE SOUZA", "0333520378");
    expect(msg).toContain("incompleto (10 dígitos");
  });

  it("usa um rótulo genérico quando o nome não veio", () => {
    expect(problemaNoDocumentoDoTomador("", "")).toContain("O tomador está sem CPF");
  });
});
