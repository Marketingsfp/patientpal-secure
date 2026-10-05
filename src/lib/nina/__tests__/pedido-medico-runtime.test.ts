import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"]) {
  for (const caso of ["consulta", "obrigatorio", "obrigatorio_retomada", "foto", "solicitado", "dispensado", "os"]) {
    it(`${ambiente}/${caso}: foto de pedido no núcleo compartilhado`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, `fonte_${caso === "os" ? "os" : "base"}_pedido_${caso}`], {
        cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
      });
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
      expect(linha).toBeDefined();
      const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
      const entrada = JSON.stringify(r.requests);
      if (caso !== "os") expect(entrada).toContain("SOLICITAR_FOTO_PEDIDO_MEDICO");
      else expect(entrada).not.toContain("SOLICITAR_FOTO_PEDIDO_MEDICO");
      const solicita = caso === "consulta" || caso.startsWith("obrigatorio");
      expect(r.resposta.includes("Pode enviar uma foto legível do pedido médico por aqui?")).toBe(solicita);
      if (solicita) expect(r.resposta.match(/Pode enviar uma foto legível/g)).toHaveLength(1);
      if (caso === "foto") expect(entrada).toContain("foto_recebida");
      if (caso === "solicitado") expect(entrada).toContain("ja_solicitado");
      expect(r.rede).toBe(0);
    });
  }
}
