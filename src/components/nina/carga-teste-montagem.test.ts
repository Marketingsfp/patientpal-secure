import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("CargaTeste monta, atualiza e desmonta com efeitos React reais em processo isolado", async () => {
  const fixture = fileURLToPath(
    new URL("./__tests__/fixtures/carga-teste-montagem.fixture.tsx", import.meta.url),
  );
  const processo = Bun.spawn([process.execPath, "test", fixture], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, codigo] = await Promise.all([
    new Response(processo.stdout).text(),
    new Response(processo.stderr).text(),
    processo.exited,
  ]);
  const saida = stdout + stderr;
  expect(saida).toContain("4 pass");
  expect(codigo, saida).toBe(0);
}, 30000);
