import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("histórico: efeitos React e rolagem sob demanda", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/historico-scroll.fixture.tsx", import.meta.url),
  );
  const p = Bun.spawn([process.execPath, "test", fixture], { stdout: "pipe", stderr: "pipe" });
  const [out, err, codigo] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  expect(codigo, out + err).toBe(0);
  expect(out + err).toContain("6 pass");
}, 30000);
