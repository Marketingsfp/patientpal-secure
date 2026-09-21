import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("escolha incorreta de médico no núcleo real com catálogo atual", () => {
  for (const ambiente of ["producao", "homologacao"]) for (const etapa of ["primeiro", "segundo", "resolvido"]) {
    it(`${ambiente}: ${etapa}`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_medico_${etapa}`], {
        cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
      });
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="))!;
      const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
      expect(r.rede).toBe(0);
      expect(r.argumentosFerramentas[0].args.termo).toBe("Dermatologia");
      expect(r.ferramentas).not.toContain("agendar");
      expect(r.encaminhamentos).toHaveLength(etapa === "segundo" ? 1 : 0);
      if (etapa === "primeiro") {
        expect(r.resposta).toContain("Não encontrei esse nome entre os médicos desta consulta");
        expect(r.resposta).toContain("Shirley Martins");
        expect(r.resposta).toContain("Raisa Moura");
        expect(JSON.stringify(r.gravacoes)).toContain('"motivo":"medico_nao_identificado"');
        expect(r.requests).toHaveLength(1);
      } else if (etapa === "segundo") {
        expect(r.encaminhamentos[0].motivo).toContain("CATALOGO_MEDICO_NAO_IDENTIFICADO");
        expect(r.encaminhamentos[0].resumo).toContain("Consulta encontrada: Dermatologia");
        expect(r.resposta).not.toContain("Qual deseja?");
        expect(r.requests).toHaveLength(1);
      } else {
        expect(r.resposta).toContain("Vamos continuar com Shirley");
        expect(r.requests).toHaveLength(2);
      }
    });
  }
});
