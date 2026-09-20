import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
it("handlers de carga passam em processo isolado, sem mocks afetarem outras suítes", () => {
  const fixture = fileURLToPath(new URL("./fixtures/carga-handlers.fixture.ts", import.meta.url));
  const p = Bun.spawnSync([process.execPath, "test", fixture], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const saida = new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr);
  expect(saida).toContain("12 pass");
  expect(p.exitCode, saida).toBe(0);
}, 20_000);
