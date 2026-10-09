import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("Jev: uma chamada, duas decisões, concorrência isolada e mesmos registros nos dois ambientes", () => {
  const p = Bun.spawnSync(
    [
      process.execPath,
      fileURLToPath(new URL("./fixtures/auditoria-jev.fixture.ts", import.meta.url)),
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 15000 },
  );
  expect(p.exitCode, p.stderr.toString()).toBe(0);
  const r = JSON.parse(
    p.stdout
      .toString()
      .split(/\r?\n/)
      .find((l) => l.startsWith("AUDITORIA="))!
      .slice(10),
  );
  for (const ambiente of ["producao", "homologacao"])
    for (const indice of [1, 2]) {
      const eventos = r.nina_trace_eventos.filter(
        (e: any) => e.trace_id === `${ambiente}-${indice}`,
      );
      expect(eventos).toHaveLength(4);
      expect(
        eventos.every(
          (e: any) =>
            e.clinica_id === `clinica-${indice}` && e.conversation_id === `conversa-${indice}`,
        ),
      ).toBe(true);
      const chamada = eventos.find((e: any) => e.node_id === "ai.auxiliary");
      const decisoes = eventos.filter((e: any) => e.node_id === "jev.decision");
      expect(chamada.metadata.consumoEntrada).toBe(11);
      expect(decisoes).toHaveLength(2);
      expect(
        decisoes.every(
          (e: any) =>
            e.metadata.chamada_id === chamada.metadata.id &&
            e.metadata.respostas.urgencia.noul === indice / 10,
        ),
      ).toBe(true);
    }
});
