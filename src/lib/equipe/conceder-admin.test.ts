import { describe, expect, it } from "vitest";
import { exigeAdministrador } from "./conceder-admin";

describe("exigeAdministrador", () => {
  it("conceder admin exige administrador", () => {
    expect(exigeAdministrador({ papelFinal: "admin", papelAtual: "recepcao" })).toBe(true);
  });
  it("alterar vínculo que hoje é admin exige administrador", () => {
    expect(exigeAdministrador({ papelFinal: "recepcao", papelAtual: "admin" })).toBe(true);
  });
  it("alterar o próprio vínculo exige administrador", () => {
    expect(exigeAdministrador({ papelFinal: "gestor", papelAtual: "gestor", alvoEhOProprio: true })).toBe(true);
  });
  it("gestor muda recepção para caixa sem exigir administrador", () => {
    expect(exigeAdministrador({ papelFinal: "caixa", papelAtual: "recepcao" })).toBe(false);
  });
  it("cadastro novo não-admin não exige administrador", () => {
    expect(exigeAdministrador({ papelFinal: "medico", papelAtual: null })).toBe(false);
  });
});
