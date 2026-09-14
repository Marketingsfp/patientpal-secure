import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("executa os 10 cenários de timeout isolando mocks de banco e handoff", () => {
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
  expect(saida).toContain("10 pass");
}, 20_000);
