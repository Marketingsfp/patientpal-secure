import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { REGRA_IDENTIDADE_ATENDIMENTO } from "../prompt/identidade-atendimento";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("Clínico Geral: prompt efetivo, pesquisa, escolha do médico e modalidade", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const [caso, medico, modalidade] of [
      ["carlos", "Carlos Alberto Varillas", "ficha"],
      ["milton", "Milton Guimarães", "hora_marcada"],
      ["medica", "Ana Souza", "hora_marcada"],
    ]) it(`${ambiente}: ${medico}`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_clinico_geral_${caso}`], {
        cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15_000,
      });
      const output = p.stdout.toString();
      expect(p.exitCode, output + p.stderr.toString()).toBe(0);
      const linha = output.split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
      expect(linha, output).toBeDefined();
      const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
      expect(r.requests).toHaveLength(4);
      for (const req of r.requests) expect(req.messages.find((m: any) => m.role === "system").content).toContain(REGRA_IDENTIDADE_ATENDIMENTO);
      expect(r.argumentosFerramentas).toEqual([
        { nome: "consultar_base_conhecimento", args: { termo: "Clínico Geral", tipo_atendimento: "consulta" } },
        { nome: "buscar_medicos", args: { nome: medico, especialidade: "Clínico Geral" } },
        { nome: "proxima_vaga", args: { medico_id: "medico-clinico", especialidade: "Clínico Geral" } },
      ]);
      expect(r.resultados.at(-1).dados).toMatchObject({
        modalidade_atendimento: modalidade,
        consulta_preservada: { termo: "Clínico Geral", tipo_atendimento: "consulta", medico },
      });
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.rede).toBe(0);
    });
  }
});
