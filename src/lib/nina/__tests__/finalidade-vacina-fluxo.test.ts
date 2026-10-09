import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("vacinação no núcleo compartilhado, serviços simulados", () => {
  for (const ambiente of ["producao", "homologacao"])
    for (const caso of ["simples", "repetida"])
      it(`${ambiente}: ${caso}`, () => {
        const p = Bun.spawnSync([process.execPath, fixture, ambiente, `vacina_${caso}`], {
          stdout: "pipe",
          stderr: "pipe",
          timeout: 15000,
        });
        expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
        const r = JSON.parse(
          p.stdout
            .toString()
            .split(/\r?\n/)
            .find((l) => l.startsWith("DIRETA_RESULTADO="))!
            .slice(17),
        );
        expect(r.rede).toBe(0);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resposta).toContain("DNA");
        expect(r.resposta).toContain("Pix");
        expect(r.resposta.match(/vacina da gripe/g)).toHaveLength(1);
        expect(r.resposta).not.toContain("Você se refere");
        expect(r.resposta).not.toContain("PCR");
        expect(r.estadoPerguntas.knowledge_context?.esclarecimento).toBeUndefined();
        expect(
          r.argumentosFerramentas.every((c: any) =>
            ["DNA paternidade", "vacina da gripe"].includes(c.args.termo),
          ),
        ).toBe(true);
        expect(JSON.stringify(r.requests[0].messages)).toContain("FINALIDADE DO PEDIDO");
      });
});
