import { describe, expect, test } from "bun:test";
import { NINA_RUNTIME_VERSION, NINA_SOURCE_FINGERPRINT } from "../runtime-version";
import { criarRegistroTurno, finalizarRegistroTurno, resumoTurnoParaTrace } from "./turno";

describe("versão do núcleo usada no turno", () => {
  test("registra a mesma versão nos caminhos real e de homologação", () => {
    for (const ambiente of ["producao", "homologacao"]) {
      const turno = criarRegistroTurno({ turnoId: ambiente, ambiente });
      expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_versao).toBe(
        NINA_RUNTIME_VERSION,
      );
      expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_fingerprint).toBe(
        NINA_SOURCE_FINGERPRINT,
      );
    }
  });

  test("preserva a versão histórica e não preenche registros legados com a versão atual", () => {
    const turno = criarRegistroTurno({ turnoId: "historico" });
    turno.runtimeVersao = "versao-anterior";
    expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_versao).toBe(
      "versao-anterior",
    );
    delete turno.runtimeVersao;
    expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_versao).toBeNull();
  });

  test("preserva o fingerprint histórico sem atribuir a ele os fontes do servidor atual", () => {
    const turno = criarRegistroTurno({ turnoId: "historico" });
    turno.runtimeFingerprint = `sha256:${"a".repeat(64)}`;
    expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_fingerprint).toBe(
      `sha256:${"a".repeat(64)}`,
    );
    delete turno.runtimeFingerprint;
    expect(resumoTurnoParaTrace(finalizarRegistroTurno(turno)).runtime_fingerprint).toBeNull();
  });

  test("execução Bun sem injeção de build declara fingerprint indisponível", () => {
    expect(NINA_SOURCE_FINGERPRINT).toBeNull();
  });
});
