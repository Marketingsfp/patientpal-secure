import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["homologacao", "producao"]) for (const variante of ["com", "sem"]) {
  test(`${ambiente}: interpretação preserva consulta ${variante} preventivo no estado e na evidência`, () => {
    const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_interpretado_preventivo_${variante}`], {
      cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15_000,
    });
    const output = p.stdout.toString();
    expect(p.exitCode, output + p.stderr.toString()).toBe(0);
    const linha = output.split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
    const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
    expect(r.encaminhamentos).toHaveLength(0);
    const preferencia = { especialidade: "GINECOLOGIA", preventivo: variante };
    expect(r.etapas.find((e: any) => e.titulo === "Dados atuais da base compartilhados com a Nina")?.dados.atendimento_escolhido).toEqual(preferencia);
    expect(r.gravacoes.findLast((g: any) => g.valor.nina_fluxo_estado)?.valor.nina_fluxo_estado.knowledge_context.atendimentoConsulta).toEqual(preferencia);
    expect(r.rede).toBe(0);
  });
}
