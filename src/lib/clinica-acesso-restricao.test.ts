import { describe, expect, it } from "bun:test";
import { decidirAcessoDominio } from "./clinica-acesso";

describe("restrição de acesso por domínio", () => {
  it("domínio restrito: usuário com vínculo pode", () => {
    expect(decidirAcessoDominio({ restrito: true, temVinculo: true, adminPlataforma: false })).toBe(true);
  });
  it("domínio restrito: usuário sem vínculo não pode", () => {
    expect(decidirAcessoDominio({ restrito: true, temVinculo: false, adminPlataforma: false })).toBe(false);
  });
  it("domínio restrito: admin de plataforma sem vínculo pode", () => {
    expect(decidirAcessoDominio({ restrito: true, temVinculo: false, adminPlataforma: true })).toBe(true);
  });
  it("domínio sem restrição: qualquer usuário pode", () => {
    expect(decidirAcessoDominio({ restrito: false, temVinculo: false, adminPlataforma: false })).toBe(true);
  });
});
