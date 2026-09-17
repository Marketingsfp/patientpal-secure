import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("edição do catálogo: autorização, prévia sem escrita e confirmação concorrente", () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/catalogo-edicao-handlers.fixture.ts", import.meta.url),
  );
  const p = Bun.spawnSync([process.execPath, "test", fixture], { stdout: "pipe", stderr: "pipe" });
  const saida = new TextDecoder().decode(p.stdout) + new TextDecoder().decode(p.stderr);
  expect(p.exitCode, saida).toBe(0);
  expect(saida).toContain("9 pass");
}, 20_000);
