import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("valida espera e handoff reais com relógio e armazenamento simulados", () => {
  const fixture = fileURLToPath(
    new URL("./__tests__/fixtures/espera-timeout.fixture.ts", import.meta.url),
  );
  const processo = Bun.spawnSync([process.execPath, "test", fixture], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const saida =
    new TextDecoder().decode(processo.stdout) + new TextDecoder().decode(processo.stderr);
  expect(processo.exitCode, saida).toBe(0);
  expect(saida).toContain("0 fail");
}, 20_000);

it("job autenticado verifica espera mesmo sem lotes ou com falha na recuperação", () => {
  const fixture = fileURLToPath(
    new URL("./__tests__/fixtures/espera-job.fixture.ts", import.meta.url),
  );
  const processo = Bun.spawnSync([process.execPath, fixture], { stdout: "pipe", stderr: "pipe" });
  const saida =
    new TextDecoder().decode(processo.stdout) + new TextDecoder().decode(processo.stderr);
  expect(processo.exitCode, saida).toBe(0);
  expect(saida).toContain("ESPERA_JOB_OK");
}, 20_000);
