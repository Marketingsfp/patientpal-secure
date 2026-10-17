import { expect, it } from "bun:test";

it("fila da pesquisa: envia uma vez, descarta reaberta, respeita 2 horas e só aceita nota enviada", () => {
  const fixture = new URL("./fixtures/pesquisa-fila.fixture.ts", import.meta.url);
  const r = Bun.spawnSync([
    process.execPath,
    decodeURIComponent(fixture.pathname).replace(/^\/(\w:)/, "$1"),
  ]);
  expect(r.exitCode, r.stdout.toString() + r.stderr.toString()).toBe(0);
});
