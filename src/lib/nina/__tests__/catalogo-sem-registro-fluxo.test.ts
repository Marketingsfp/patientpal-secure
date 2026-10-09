import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("catálogo ausente no núcleo real, sem rede nem motor de confiança", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const cenario of [
      "consulta",
      "exame",
      "procedimento",
      "modelo",
      "misto",
      "medicos_modelo",
      "procedimentos_modelo",
      "especialidades_modelo",
      "falha_handoff",
      "obsoleto",
      "dado_pessoal",
      "generico",
    ]) {
      it(`${ambiente}: ${cenario}`, () => {
        const p = Bun.spawnSync(
          [process.execPath, fixture, ambiente, `catalogo_ausente_${cenario}`],
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
          .find((l) => l.startsWith("DIRETA_RESULTADO="));
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
        // Primeira ausência pede identificação, inclusive para profissionais.
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resposta).not.toContain("não oferece");
        expect(r.resposta).not.toContain("R$ 80");
        if (cenario === "medicos_modelo")
          expect(r.resposta).toContain("Pode escrever o nome novamente");
      });
    }
  }
});
