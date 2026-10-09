import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("Políticas no prompt, execução compartilhada (modelo/banco simulados)", () => {
  it("opção silenciosa persiste em atribuições posteriores e retries nos dois ambientes", () => {
    const path = fileURLToPath(new URL("./fixtures/sfp-protocolo.fixture.ts", import.meta.url));
    const p = Bun.spawnSync([process.execPath, path], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15000,
    });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
    expect(p.stdout.toString()).toContain("SILENCIO_PROTOCOLO_OK: 4 cenários");
  });
  for (const ambiente of ["producao", "homologacao"]) {
    for (const cenario of [
      "catalogo_sfp",
      "catalogo_tecnica",
      "catalogo_enfermagem",
      "catalogo_equipe_enfermagem",
      "catalogo_sfp_restricao_publicada",
      "catalogo_sfp_recusa_agenda_modelo",
      "catalogo_sfp_handoff_modelo",
      "catalogo_sfp_handoff_modelo_falha_handoff",
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
        expect(r.rede).toBe(0);
        expect(r.motorChamado).toBe(0);
        if (
          ["catalogo_sfp_recusa_agenda_modelo", "catalogo_sfp_restricao_publicada"].includes(
            cenario,
          )
        ) {
          expect(r.encaminhamentos).toHaveLength(1);
          expect(r.encaminhamentos[0].motivo).toContain("PROFISSIONAL_SFP");
          expect(r.encaminhamentos[0].motivo.toLowerCase()).toContain("eletrocardiograma");
        } else if (cenario.includes("handoff_modelo")) {
          expect(r.encaminhamentos).toHaveLength(1);
          expect(r.encaminhamentos[0].avisar_paciente).toBe(false);
          expect(r.ferramentas).toEqual(["solicitar_atendente_humano"]);
          if (cenario.endsWith("falha_handoff")) {
            expect(r.resposta).toContain(
              ambiente === "homologacao" ? "Não consegui registrar" : "Não consegui transferir",
            );
            expect(r.resultado?.estado).not.toBe("descartar");
          } else {
            expect(r.resposta).toBe("");
            expect(r.resultado.restricoes).toContain("handoff_silencioso_solicitado");
          }
        } else {
          expect(r.requests).toHaveLength(2);
          expect(r.resposta.replace(/\s/g, "")).toBe(r.respostaModelo.replace(/\s/g, ""));
          expect(r.resposta).toContain("\nProfissional:");
          const ferramenta = r.requests[1].messages.find(
            (m: { role: string }) => m.role === "tool",
          );
          expect(JSON.stringify(ferramenta)).toContain(
            cenario === "catalogo_sfp"
              ? "SFP"
              : cenario === "catalogo_tecnica"
                ? "TÉCNICA"
                : cenario === "catalogo_enfermagem"
                  ? "ENFERMAGEM"
                  : "EQUIPE DE ENFERMAGEM",
          );
          expect(JSON.stringify(ferramenta)).not.toContain("Pix/cartão");
          expect(r.encaminhamentos).toHaveLength(0);
        }
      });
    }
  }
});
