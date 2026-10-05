import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"]) for (const sessao of ["nova", "retomada"]) {
  it(`${ambiente}/${sessao}: modelo não recebe links da entrada nem do histórico`, () => {
    const p = Bun.spawnSync([process.execPath, fixture, ambiente, `fonte_base_links_${sessao}`], {
      cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
    });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
    const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
    expect(linha).toBeDefined();
    const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
    const enviados = JSON.stringify(r.requests);
    expect(enviados).toContain("[link bloqueado]");
    expect(enviados).toContain("traçado do coração");
    expect(enviados).not.toContain("externo-paciente.com");
    expect(enviados).not.toContain("historico-paciente.com");
    expect(enviados).not.toContain("bit.ly/laudo");
    expect(r.rede).toBe(0);
  });
}
