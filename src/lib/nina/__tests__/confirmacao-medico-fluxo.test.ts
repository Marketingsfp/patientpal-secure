import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));

describe("respostas informais no núcleo real com catálogo reconsultado", () => {
  for (const ambiente of ["producao", "homologacao"])
    for (const mensagem of ["Isso", "esse mesmo", "esse", "sim", "ss", "Confirmo"]) {
      it(`${ambiente}: ${mensagem} escolhe o único médico sem consumir esclarecimento`, () => {
        const p = Bun.spawnSync(
          [
            process.execPath,
            fixture,
            ambiente,
            `catalogo_medico_confirmacao${mensagem === "Confirmo" ? "_segunda" : ""}`,
            mensagem,
          ],
          {
            cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
            stdout: "pipe",
            stderr: "pipe",
            timeout: 15000,
          },
        );
        expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
        const linha = p.stdout
          .toString()
          .split(/\r?\n/)
          .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
        const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
        expect(r.rede).toBe(0);
        expect(r.argumentosFerramentas[0].args).toMatchObject({
          termo: "clinico geral",
          medico: "medico-0",
          tipo_atendimento: "consulta",
        });
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resultados[0].dados.esclarecimento).toBeUndefined();
        expect(r.resultados[0].dados.records.map((i: any) => i.id)).toEqual(["medico-0"]);
        expect(r.resposta).toContain("Sandro Prinscewal");
        expect(r.requests).toHaveLength(2);
        expect(r.ferramentas).not.toContain("agendar");
        expect(r.gravacoes.filter((g: any) => g.tabela === "agendamentos")).toHaveLength(0);
        const salvos = r.gravacoes.filter(
          (g: any) => g.tabela === "atend_conversas" && g.valor.nina_fluxo_estado,
        );
        const estado = salvos.at(-1)?.valor.nina_fluxo_estado;
        expect(estado.knowledge_context.esclarecimento).toBeUndefined();
        expect(estado.knowledge_context.selecao.medicoNome).toBe("Sandro Prinscewal");
        expect(estado.appointment.confirmation?.aceita ?? false).toBe(false);
      });
    }
});
