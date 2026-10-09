// Os mocks de módulos do Bun são globais: cada suíte de banco usa seu processo.
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
test("carga-fase4-contexto-limpo.fixture.ts: contratos de banco em processo isolado", () => {
  const arquivo = fileURLToPath(
    new URL("./carga-fase4-contexto-limpo.fixture.ts", import.meta.url),
  );
  const p = Bun.spawnSync([process.execPath, "test", arquivo], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30000,
  });
  const saida = p.stdout.toString() + p.stderr.toString();
  expect(saida).toContain("pass");
  expect(p.exitCode, saida).toBe(0);
}, 35000);
