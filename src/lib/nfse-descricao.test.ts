import { describe, expect, it } from "bun:test";
import { acrescentarEspecialidade, especialidadeDoProcedimento } from "./nfse-descricao";

const ESP = ["PEDIATRIA", "NEUROLOGIA", "CARDIOLOGIA", "Ortopedia"];

describe("especialidade na descrição da NFS-e", () => {
  it("lê a especialidade do fim do procedimento", () => {
    expect(especialidadeDoProcedimento("CONSULTA 2 (NEUROLOGIA)", ESP)).toBe("NEUROLOGIA");
    expect(especialidadeDoProcedimento("CONSULTA (ortopedia)", ESP)).toBe("ORTOPEDIA");
  });
  it("não inventa: sufixo que não é especialidade ou procedimento sem sufixo", () => {
    expect(especialidadeDoProcedimento("ECOCARDIOGRAMA (ADULTO)", ESP)).toBeNull();
    expect(especialidadeDoProcedimento("CONSULTA 2", ESP)).toBeNull();
    expect(acrescentarEspecialidade("CONSULTA", null)).toBe("CONSULTA");
  });
  it("formato do portal", () => {
    expect(acrescentarEspecialidade("CONSULTA", "PEDIATRIA")).toBe("CONSULTA (PEDIATRIA)");
    expect(acrescentarEspecialidade("CONSULTA — Nota parcial (R$ 10,00 de R$ 20,00)", "PEDIATRIA")).toBe(
      "CONSULTA (PEDIATRIA) — Nota parcial (R$ 10,00 de R$ 20,00)",
    );
  });
  it("não repete quando a descrição já cita a especialidade", () => {
    expect(acrescentarEspecialidade("ECOCARDIOGRAMA (ADULTO) (CARDIOLOGIA)", "CARDIOLOGIA")).toBe(
      "ECOCARDIOGRAMA (ADULTO) (CARDIOLOGIA)",
    );
  });
});
