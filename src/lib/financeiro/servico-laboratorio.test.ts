import { describe, expect, it } from "bun:test";
import { SERVICO_LABORATORIO, unificarServicoLaboratorio } from "./servico-laboratorio";

describe("unificarServicoLaboratorio", () => {
  it("junta os nomes do laboratório num só", () => {
    for (const nome of [
      "EXAMES LABORATORIAIS",
      "LABORATORIO",
      "Laboratório",
      "LABORATÓRIO (1 EXAMES): LABORATORIO",
      "LABORATÓRIO (3 EXAMES): EAS, HEMOGRAMA, VDRL",
    ]) {
      expect(unificarServicoLaboratorio(nome)).toBe(SERVICO_LABORATORIO);
    }
  });

  it("não mexe em outros serviços", () => {
    for (const nome of ["LABORATORIO CARTAO", "HEMOGRAMA COMPLETO (LABORATORIO)", "CONSULTA 2"]) {
      expect(unificarServicoLaboratorio(nome)).toBe(nome);
    }
  });
});
