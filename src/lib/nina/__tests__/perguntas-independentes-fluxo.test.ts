import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("perguntas independentes no núcleo compartilhado (serviços simulados)", () => {
  for (const ambiente of ["producao", "homologacao"])
    for (const caso of ["normal", "invertida", "sequencial", "repetida", "duas_duvidas", "retomada", "obsoleto"])
      it(ambiente + ": " + caso, () => {
        const p = Bun.spawnSync(
          [process.execPath, fixture, ambiente, "catalogo_multiplas_" + caso],
          { stdout: "pipe", stderr: "pipe", timeout: 15000 },
        );
        expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
        const linha = p.stdout
          .toString()
          .split(/\r?\n/)
          .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
        const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
        expect(r.rede).toBe(0);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.ferramentas).not.toContain("agendar");
        if (caso === "obsoleto") {
          expect(r.resposta).toBe("");
          return;
        }
        const salvo = r.gravacoes.filter((g: any) => g.tabela === "atend_conversas" && g.valor.nina_fluxo_estado).at(-1)?.valor.nina_fluxo_estado;
        expect(salvo?.knowledge_context?.consulta.termo).toBe("Urologia");
        expect(r.resposta).toContain("Sobre Urologia");
        if (caso === "duas_duvidas") {
          expect(r.resposta).toContain("Sobre Psiquiatria");
          expect(r.resposta).not.toContain("às segundas");
          expect(r.estadoPerguntas.knowledge_context.pendenciasIdentificacao).toHaveLength(2);
          expect(r.estadoPerguntas.knowledge_context.esclarecimento.opcoes).toHaveLength(0);
        } else {
          expect(r.resposta).toContain("Dr. Antonio atende Psiquiatria");
          expect(r.estadoPerguntas.knowledge_context.consulta.termo).toBe("Urologia");
        }
        expect(r.resposta).not.toContain("999");
        expect(r.estadoPerguntas.knowledge_context.esclarecimentoTentativas).toBe(1);
        expect(
          JSON.stringify(r.requests.at(-1).messages.filter((m: any) => m.role === "tool")),
        ).not.toContain("999");
        const chamadas = r.requests[0].messages;
        expect(JSON.stringify(chamadas)).toContain("Perguntas independentes");
      });
});
