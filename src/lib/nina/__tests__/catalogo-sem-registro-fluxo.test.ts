import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("catálogo ausente no núcleo real, sem rede nem motor de confiança", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const cenario of ["consulta", "exame", "procedimento", "modelo", "misto", "medicos_modelo", "procedimentos_modelo", "especialidades_modelo", "falha_handoff", "obsoleto", "dado_pessoal", "generico"]) {
      it(`${ambiente}: ${cenario}`, () => {
        const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_ausente_${cenario}`], {
          cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
        });
        expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
        const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        expect(r.rede).toBe(0);
        expect(r.motorChamado).toBe(0);
        expect(r.temNota).toBe(false);
        expect(r.ferramentas).not.toContain("agendar");
        if (["obsoleto", "dado_pessoal", "generico"].includes(cenario)) {
          expect(r.encaminhamentos).toHaveLength(0);
          expect(r.requests).toHaveLength(1);
          if (cenario === "obsoleto") expect(r.resposta).toBe("");
          return;
        }
        expect(r.encaminhamentos).toHaveLength(1);
        expect(r.encaminhamentos[0].motivo).toContain("CATALOGO_SEM_REGISTRO");
        expect(r.requests).toHaveLength(1);
        expect(r.ordem[0]).toBe("modelo");
        expect(r.ordem.indexOf("solicitar_atendente_humano")).toBeGreaterThan(1);
        expect(r.resposta).not.toContain("não oferece");
        expect(r.resposta).not.toContain("R$ 80");
        // A interpretação e a consulta precedem o encaminhamento e ficam
        // associadas à execução real do modelo na auditoria.
        const eventos = r.gravacoes.filter((g: any) => g.tabela === "nina_trace_eventos").flatMap((g: any) => g.valor);
        const resumo = eventos.find((e: any) => e.node_id === "turn.summary");
        expect(resumo.metadata.motivo_origem).toContain("CATALOGO_SEM_REGISTRO");
        expect(resumo.metadata.modelo_chamado).toBe(true);
        if (ambiente === "homologacao") {
          expect(r.resposta).toContain("simulação");
          expect(r.resposta).not.toContain("Transferido para atendimento humano");
          if (cenario === "falha_handoff") expect(r.resposta).toContain("Não consegui registrar");
          else expect(r.resposta).toContain("registrei");
        } else if (cenario === "falha_handoff") {
          expect(r.resposta).toContain("Não consegui transferir");
          expect(r.resposta).not.toContain("Encaminhei");
        } else expect(r.resposta).toContain("Encaminhei");
      });
    }
  }
});
