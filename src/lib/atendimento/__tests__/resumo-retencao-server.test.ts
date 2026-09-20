import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(
  new URL("./fixtures/resumo-retencao-server.fixture.ts", import.meta.url),
);
for (const caso of [
  "normal",
  "vaga_criada_antes",
  "entrada_antes_sessao",
  "expirado",
  "outro_ciclo",
  "expirou_durante_ia",
  "resolveu_durante_ia",
  "reabriu_durante_ia",
]) {
  test(`servidor do resumo: ${caso}`, () => {
    const p = Bun.spawnSync([process.execPath, fixture, caso], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
  });
}
