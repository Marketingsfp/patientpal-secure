import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"]) for (const etapa of ["primeiro", "confirmou_resolvido", "confirmou_fechamento_resolvido", "recusou", "corrigiu_resolvido", "reformulou_sem_resultado", "mudou_assunto"]) {
  it(`${ambiente}/${etapa}: identificação no núcleo compartilhado`, () => {
    const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_identificacao_${etapa}`], {
      cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
    });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
    const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
    expect(linha).toBeDefined();
    const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
    expect(r.rede).toBe(0);
    expect(r.ferramentas.filter((f: string) => f === "solicitar_atendente_humano")).toHaveLength(etapa === "reformulou_sem_resultado" ? 1 : 0);
    if (["primeiro", "mudou_assunto"].includes(etapa)) {
      expect(r.resposta).toContain("Você se refere a Eletrocardiograma?");
      expect(r.resposta).toContain("Se não for esse o exame ou procedimento");
      expect(r.resposta.match(/\?/g)).toHaveLength(1);
      expect(r.resposta).not.toContain("R$");
    } else if (etapa === "recusou") {
      expect(r.resposta).toContain("Pode escrever novamente");
      expect(r.ferramentas).toHaveLength(0);
      expect(r.requests).toHaveLength(0);
    } else if (etapa.endsWith("resolvido")) {
      expect(r.resposta).toContain("Eletrocardiograma");
      expect(r.requests).toHaveLength(2);
      if (etapa.startsWith("confirmou")) {
        expect(r.argumentosFerramentas.length).toBeGreaterThan(0);
        for (const chamada of r.argumentosFerramentas) expect(chamada.args.termo).toBe("Eletrocardiograma");
      }
    } else {
      expect(r.encaminhamentos[0].motivo).toContain("CATALOGO_IDENTIFICACAO");
      expect(r.resposta).not.toContain("Você quis dizer");
    }
  });
}
