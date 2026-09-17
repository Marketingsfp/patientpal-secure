import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("Regra de catálogo na geração real (modelo/banco simulados, rede proibida)", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const cenario of [
      "catalogo_sfp",
      "catalogo_sfp_falha_handoff",
      "catalogo_sfp_modelo",
      "catalogo_sfp_obsoleto",
      "catalogo_tecnica",
    ]) {
      it(`${ambiente}: ${cenario}`, () => {
        const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
          cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
          stdout: "pipe",
          stderr: "pipe",
          timeout: 15000,
        });
        expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
        const linha = p.stdout
          .toString()
          .split(/\r?\n/)
          .find((l) => l.startsWith("DIRETA_RESULTADO="));
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        expect(r.motorChamado).toBe(0);
        expect(r.rede).toBe(0);
        expect(r.temNota).toBe(false);
        if (cenario === "catalogo_sfp_obsoleto") {
          expect(r.requests).toHaveLength(0);
          expect(r.encaminhamentos).toHaveLength(0);
          expect(r.resposta).toBe("");
        } else if (cenario.startsWith("catalogo_sfp")) {
          expect(r.requests).toHaveLength(cenario === "catalogo_sfp_modelo" ? 1 : 0);
          expect(r.ferramentas).toEqual([
            "consultar_base_conhecimento",
            "solicitar_atendente_humano",
          ]);
          expect(r.encaminhamentos[0].motivo).toContain("PROFISSIONAL_SFP");
          expect(r.resposta).not.toContain("R$ 80");
          if (cenario.endsWith("falha_handoff")) {
            expect(r.resposta).toContain("Não consegui transferir");
            expect(r.resposta).not.toContain("Encaminhei");
          } else expect(r.resposta).toContain("Encaminhei");
        } else {
          expect(r.requests).toHaveLength(1);
          expect(JSON.stringify(r.requests)).not.toContain('"TÉCNICA"');
          expect(r.resposta).not.toMatch(/t[eé]cnic[oa]/i);
          for (const fato of ["80,00", "95,00", "Sem jejum", "8h às 12h", "pedido médico"])
            expect(r.resposta).toContain(fato);
          expect(r.encaminhamentos).toHaveLength(0);
        }
      });
    }
  }
});
