import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
it("inspeção compartilhada: componentes React reais com APIs simuladas", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/inspecao-mensagem.fixture.tsx", import.meta.url),
  );
  const processo = Bun.spawn([process.execPath, "test", fixture], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, codigo] = await Promise.all([
    new Response(processo.stdout).text(),
    new Response(processo.stderr).text(),
    processo.exited,
  ]);
  expect(codigo, stdout + stderr).toBe(0);
  expect(stdout + stderr).toContain("10 pass");
}, 30000);
