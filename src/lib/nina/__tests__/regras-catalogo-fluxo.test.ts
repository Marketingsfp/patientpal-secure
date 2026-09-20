import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("Regra de catálogo na geração real (modelo/banco simulados, rede proibida)", () => {
  it("protocolo SFP permanece interno também na atribuição posterior e nas novas tentativas", () => {
    const protocoloFixture = fileURLToPath(new URL("./fixtures/sfp-protocolo.fixture.ts", import.meta.url));
    const p = Bun.spawnSync([process.execPath, protocoloFixture], { stdout: "pipe", stderr: "pipe", timeout: 15000 });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
    expect(p.stdout.toString()).toContain("SFP_PROTOCOLO_OK: 4 cenários");
  });
  for (const ambiente of ["producao", "homologacao"]) {
    for (const cenario of [
      "catalogo_sfp",
      "catalogo_sfp_falha_handoff",
      "catalogo_sfp_modelo",
      "catalogo_sfp_handoff_modelo",
      "catalogo_sfp_recusa_agenda_modelo",
      "catalogo_sfp_obsoleto",
      "catalogo_tecnica",
      "catalogo_enfermagem",
      "catalogo_equipe_enfermagem",
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
          expect(r.requests).toHaveLength(1);
          expect(r.encaminhamentos).toHaveLength(0);
          expect(r.resposta).toBe("");
        } else if (cenario.startsWith("catalogo_sfp")) {
          expect(r.requests).toHaveLength(1);
          expect(r.ferramentas).toEqual(cenario === "catalogo_sfp_handoff_modelo"
            ? ["solicitar_atendente_humano"]
            : [cenario === "catalogo_sfp_recusa_agenda_modelo" ? "consultar_disponibilidade" : "consultar_base_conhecimento", "solicitar_atendente_humano"]);
          expect(r.encaminhamentos).toHaveLength(1);
          expect(r.encaminhamentos[0].motivo).toMatch(/PROFISSIONAL_SFP|Profissional SFP/);
          expect(r.resposta).not.toContain("R$ 80");
          if (cenario.endsWith("falha_handoff")) {
            expect(r.resposta).toContain("Não consegui transferir");
            expect(r.resposta).not.toContain("Encaminhei");
          } else {
            expect(r.resposta).toBe("");
            expect(r.resultado.estado).toBe("descartar");
            expect(r.resultado.restricoes).toContain("handoff_sfp_silencioso");
            expect(r.finalizacao).toBeUndefined();
          }
        } else {
          expect(r.requests).toHaveLength(2);
          expect(JSON.stringify(r.requests)).not.toContain('"TÉCNICA"');
          expect(JSON.stringify(r.requests)).not.toMatch(/"(?:ENFERMAGEM|EQUIPE DE ENFERMAGEM)"/);
          expect(r.resposta).not.toMatch(/t[eé]cnic[oa]|enfermagem/i);
          for (const fato of ["80,00", "95,00", "Sem jejum", "8h às 12h", "pedido médico"])
            expect(r.resposta).toContain(fato);
          expect(r.encaminhamentos).toHaveLength(0);
        }
      });
    }
  }
});
