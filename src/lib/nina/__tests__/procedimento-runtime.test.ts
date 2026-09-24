import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("busca auxiliar preserva procedimento no estado gravado pelo runtime", () => {
  for (const ambiente of ["producao", "homologacao"]) test(ambiente, () => {
    const p = Bun.spawnSync([process.execPath, fixture, ambiente, "procedimento_executante"], {
      cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
    });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
    const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="))!;
    const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
    expect(r.rede).toBe(0);
    expect(r.argumentosFerramentas).toEqual([{ nome: "buscar_medicos", args: { nome: "Mariana Portugal", especialidade: "Nutrição" } }]);
    expect(r.encaminhamentos).toHaveLength(0);
    const estado = r.gravacoes.filter((g: any) => g.tabela === "atend_conversas" && g.valor.nina_fluxo_estado).at(-1)?.valor.nina_fluxo_estado;
    expect(estado.knowledge_context.consulta).toMatchObject({ termo: "Bioimpedância", tipo_atendimento: "exame_procedimento" });
    expect(estado.knowledge_context.referencias[0]).toMatchObject({ registro: "servico-bio", procedimento: "Bioimpedância" });
    expect(estado.appointment.procedimento_solicitado.catalogo_id).toBe("servico-bio");
    expect(r.gravacoes.filter((g: any) => g.tabela === "agendamentos")).toHaveLength(0);
  });
});
