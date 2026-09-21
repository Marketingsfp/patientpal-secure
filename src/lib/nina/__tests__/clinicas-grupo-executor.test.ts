import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("ferramentas consultam somente informações públicas, sem mudar a clínica operacional", () => {
  const p = Bun.spawnSync(
    [
      process.execPath,
      fileURLToPath(new URL("./fixtures/clinicas-grupo.fixture.ts", import.meta.url)),
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    },
  );
  expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
  expect(p.stdout.toString()).toContain("PASS: WhatsApp e homologação");
});
