import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));

describe("interpretação precede a busca no núcleo real da Nina", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const [caso, termo, resposta, objetivo] of [
      ["cardiologia", "cardiologia", "Cardiologia", "agendamento"],
      ["nebulizacao", "nebulização", "Nebulização", "informacoes_gerais"],
      ["usg", "usg abdome total sem doppler", "abdome total sem Doppler", "agendamento"],
      ["cardiologia_recuperacao", "cardiologia", "Cardiologia", "agendamento"],
    ]) {
      it(`${ambiente}: ${caso}, sem buscar a frase inteira ou transferir antecipadamente`, () => {
        const p = Bun.spawnSync(
          [process.execPath, fixture, ambiente, `catalogo_interpretado_${caso}`],
          {
            cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
            stdout: "pipe",
            stderr: "pipe",
            timeout: 15_000,
          },
        );
        const output = p.stdout.toString();
        expect(p.exitCode, output + p.stderr.toString()).toBe(0);
        const linha = output.split(/\r?\n/).find((l) => l.startsWith("DIRETA_RESULTADO="));
        expect(linha, output).toBeDefined();
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        expect(r.ordem).toEqual([
          ...(caso.endsWith("_recuperacao") ? ["modelo"] : []),
          "modelo",
          "consultar_base_conhecimento",
          "modelo",
        ]);
        expect(r.argumentosFerramentas).toEqual([
          { nome: "consultar_base_conhecimento", args: { termo, objetivos: [objetivo] } },
        ]);
        expect(r.requests[0].messages.some((m: { role: string }) => m.role === "tool")).toBe(false);
        expect(
          r.requests[0].messages.some(
            (m: { role: string; content?: string }) =>
              m.role === "user" && m.content?.includes(r.pergunta),
          ),
        ).toBe(true);
        expect(r.requests[1].messages.some((m: { role: string }) => m.role === "tool")).toBe(true);
        expect(r.resposta).toContain(resposta);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.rede).toBe(0);
        expect(r.motorChamado).toBe(0);
        if (caso.endsWith("_recuperacao")) {
          const recusas = r.requests[1].messages.filter((m: { role: string }) => m.role === "tool");
          expect(recusas).toHaveLength(2);
          expect(JSON.parse(recusas[0].content).consulta_executada).toBe(false);
          expect(JSON.parse(recusas[1].content).executada).toBe(false);
        }
      });
    }
  }
});
