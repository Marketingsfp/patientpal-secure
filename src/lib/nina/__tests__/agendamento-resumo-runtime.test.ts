import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("runtime entrega resumo validado e aguarda nova mensagem", () => {
  for (const ambiente of ["producao", "homologacao"])
    for (const cenario of ["escolha_horario", "escolha_sem_auditoria"])
      test(`${ambiente}, ${cenario}: resumo de 10:20 prevalece sobre rascunho de 08:00`, () => {
        const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
          cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
          stdout: "pipe",
          stderr: "pipe",
          timeout: 15000,
        });
        const output = p.stdout.toString();
        expect(p.exitCode, output + p.stderr.toString()).toBe(0);
        const linha = output.split(/\r?\n/).find((l) => l.startsWith("DIRETA_RESULTADO="));
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        expect(r.resposta).toBe(r.resumoEscolhido);
        expect(r.resposta).not.toContain("08:00");
        expect(r.ferramentas).toContain("selecionar_horario");
        expect(r.ferramentas).not.toContain("agendar");
        expect(r.requests).toHaveLength(1);
        expect(r.motorChamado).toBe(0);
        expect(r.rede).toBe(0);
        expect(r.encaminhamentos).toHaveLength(0);
      });
});
