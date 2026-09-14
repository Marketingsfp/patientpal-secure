import { describe, expect, test } from "bun:test";
import { NINA_RUNTIME_VERSION } from "../runtime-version";
import { criarRegistroTurno, finalizarRegistroTurno, resumoTurnoParaTrace } from "./turno";

describe("versão do núcleo usada no turno", () => {
  test("registra a mesma versão nos caminhos real e de homologação", () => {
    for (const ambiente of ["producao", "homologacao"]) {
      const turno = criarRegistroTurno({ turnoId: ambiente, ambiente });
      expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_versao)
        .toBe(NINA_RUNTIME_VERSION);
    }
  });

  test("preserva a versão histórica e não preenche registros legados com a versão atual", () => {
    const turno = criarRegistroTurno({ turnoId: "historico" });
    turno.runtimeVersao = "versao-anterior";
    expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_versao)
      .toBe("versao-anterior");
    delete turno.runtimeVersao;
    expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_versao).toBeNull();
  });
});
