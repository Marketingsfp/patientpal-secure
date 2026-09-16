import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { causaFalhaNina, repetirPreparacaoNina } from "../watchdog-falha";

test("retry limitado só antes de modelo, ferramentas e entrega", () => {
  const entrada = {
    erro: new Error("fetch failed"),
    etapa: "preparing",
    snapshot: null,
    entregas: 0,
    tentativa: 1,
  };
  expect(repetirPreparacaoNina(entrada)).toBe(true);
  expect(repetirPreparacaoNina({ ...entrada, tentativa: 3 })).toBe(false);
  expect(repetirPreparacaoNina({ ...entrada, maxTentativas: 1 })).toBe(false);
  expect(repetirPreparacaoNina({ ...entrada, etapa: "generating" })).toBe(false);
  expect(repetirPreparacaoNina({ ...entrada, snapshot: { texto: "Pronto" } })).toBe(false);
  expect(repetirPreparacaoNina({ ...entrada, entregas: 1 })).toBe(false);
  expect(
    repetirPreparacaoNina({
      ...entrada,
      erro: new TypeError("Cannot read properties of undefined (reading 'bind')"),
    }),
  ).toBe(false);
});

test("auditoria preserva causa, sem URL ou credencial", () => {
  expect(
    causaFalhaNina(new Error("Cannot read properties of undefined (reading 'bind')")),
  ).toContain("reading 'bind'");
  const causa = causaFalhaNina(
    new Error("fetch failed https://servico.test/?segredo=abc Bearer chave access_token=xyz"),
  );
  expect(causa).not.toContain("abc");
  expect(causa).not.toContain("chave");
  expect(causa).not.toContain("xyz");
});

test("falha realista: preparação, recuperação, handoff e corridas de responsabilidade", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/watchdog-falha.fixture.ts", import.meta.url));
  const p = Bun.spawn([process.execPath, fixture], {
    env: { ...process.env, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, codigo] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (codigo) throw new Error(out + err);
  expect(out).toContain("WATCHDOG_FALHA_OK");
}, 15000);
