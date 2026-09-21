import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("Nina: até duas perguntas e encaminhamento na geração real", () => {
  for (const ambiente of ["producao", "homologacao"])
    for (const etapa of [
      "primeiro",
      "segundo",
      "segundo_sem_registro",
      "terceiro",
      "resolvido",
      "apos_duas_resolvido",
      "novo_pedido",
    ]) {
      it(`${ambiente}: esclarecimento ${etapa}`, () => {
        const p = Bun.spawnSync(
          [process.execPath, fixture, ambiente, `catalogo_esclarecimento_${etapa}`],
          {
            cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
            stdout: "pipe",
            stderr: "pipe",
            timeout: 15000,
          },
        );
        const output = p.stdout.toString();
        expect(p.exitCode, output + p.stderr.toString()).toBe(0);
        const linha = output.split(/\r?\n/).find((l) => l.startsWith("DIRETA_RESULTADO="));
        expect(linha, output).toBeDefined();
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        expect(r.rede).toBe(0);
        expect(
          r.ferramentas.filter((f: string) => f === "solicitar_atendente_humano"),
        ).toHaveLength(etapa === "terceiro" ? 1 : 0);
        if (etapa === "primeiro" || etapa === "novo_pedido") {
          expect(r.resposta).toContain("Pode informar o nome do procedimento por extenso?");
          expect(r.resposta).not.toContain("R$");
          expect(r.requests).toHaveLength(1);
          expect(JSON.stringify(r.gravacoes)).toContain("esclarecimento");
          expect(JSON.stringify(r.gravacoes)).toContain('"esclarecimentoTentativas":1');
        } else if (etapa.startsWith("segundo")) {
          expect(r.resposta).toContain("Pode conferir e copiar o nome completo");
          expect(r.resposta).not.toContain("Pode informar o nome do procedimento por extenso?");
          expect(r.requests).toHaveLength(1);
          expect(JSON.stringify(r.gravacoes)).toContain('"esclarecimentoTentativas":2');
        } else if (etapa === "terceiro") {
          expect(r.encaminhamentos[0].motivo).toContain("CATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA");
          expect(r.encaminhamentos[0].resumo).toContain("Não sei explicar");
          expect(r.encaminhamentos[0].resumo).toContain("duas tentativas");
          expect(r.resposta).not.toContain("Pode informar o nome do procedimento por extenso?");
          expect(r.requests).toHaveLength(1);
        } else expect(r.requests).toHaveLength(2);
        expect(r.ordem[0]).toBe("modelo");
        if (etapa !== "primeiro") expect(JSON.stringify(r.requests[0].messages)).toContain("esclarecimento");
      });
    }
});
