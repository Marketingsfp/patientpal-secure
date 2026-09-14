import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("valida reset manual e início da carga com mocks isolados de outras suítes", () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/validacao-reset-homologacao.fixture.ts", import.meta.url),
  );
  const processo = Bun.spawnSync([process.execPath, "test", fixture], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const saida =
    new TextDecoder().decode(processo.stdout) + new TextDecoder().decode(processo.stderr);
  expect(processo.exitCode, saida).toBe(0);
  expect(saida).toContain("16 pass");
}, 20_000);
