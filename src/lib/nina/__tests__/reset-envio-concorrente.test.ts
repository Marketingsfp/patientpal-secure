import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("reset e entrada concorrentes usam as rotinas reais em isolamento", () => {
  const fixture = fileURLToPath(new URL("./fixtures/reset-envio-concorrente.fixture.ts", import.meta.url));
  const processo = Bun.spawnSync([process.execPath, "test", fixture], { stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  const saida = processo.stdout.toString() + processo.stderr.toString();
  expect(processo.exitCode, saida).toBe(0);
  expect(saida).toContain("5 pass");
}, 20_000);
