import { describe, expect, it } from "bun:test";
import { hostnamePadrao, idClinicaValido, normalizarHostname } from "./clinica-acesso";

describe("clinica-acesso", () => {
  it("normaliza: minúsculas, sem www, sem porta", () => {
    expect(normalizarHostname("WWW.Sistema.ClinicaX.com.br:443")).toBe("sistema.clinicax.com.br");
  });
  it("endereços padrão continuam como hoje", () => {
    expect(hostnamePadrao("patientpal-secure.lovable.app")).toBe(true);
    expect(hostnamePadrao("localhost")).toBe(true);
    expect(hostnamePadrao("sistema.clinicax.com.br")).toBe(false);
  });
  it("só aceita id de clínica em formato válido", () => {
    expect(idClinicaValido("e9e41341-0e53-4216-8284-caeeaf6fb887")).toBe(true);
    expect(idClinicaValido("abc")).toBe(false);
  });
});
