import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { REGRA_DUAS_FALHAS_ENTENDIMENTO } from "../jev-encaminhamento";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
function simular(ambiente: string, caso: string) {
  const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_duvida_${caso}`], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15_000,
  });
  const output = p.stdout.toString();
  expect(p.exitCode, output + p.stderr.toString()).toBe(0);
  const linha = output.split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
  expect(linha).toBeDefined();
  return JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
}

describe("núcleo compartilhado — encaminhar na segunda falha de entendimento", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const caso of ["primeira", "reprocessamento", "entendida", "saudacao", "apos_saudacao", "sem_pergunta", "nao_entregue"]) {
      test(`${ambiente}: ${caso} não encaminha`, () => {
        const r = simular(ambiente, caso);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.requests).toHaveLength(1);
        expect(JSON.stringify(r.requests[0].messages)).toContain(REGRA_DUAS_FALHAS_ENTENDIMENTO);
        expect(r.decisoesEntendimento.find((d: any) => d.fase === "fase1_intencao").contagem.falhas).toBe(["entendida", "saudacao"].includes(caso) ? 0 : 1);
        expect(r.rede).toBe(0);
      });
    }
    test(`${ambiente}: segunda mensagem sem entendimento encaminha uma vez, antes de outra geração`, () => {
      const r = simular(ambiente, "segunda");
      expect(r.encaminhamentos).toHaveLength(1);
      expect(r.encaminhamentos[0].motivo).toContain("JEV_DUVIDA_REPETIDA");
      expect(r.encaminhamentos[0].motivo).toContain("em 2 mensagens seguidas");
      expect(r.requests).toHaveLength(0);
      expect(r.decisoesEntendimento.find((d: any) => d.fase === "fase1_intencao").contagem.mensagensEntrada).toEqual(["entrada-simulada"]);
      expect(r.decisoesEntendimento.find((d: any) => d.fase === "fase1_intencao").contagem.esclarecimento).toEqual({ mensagemId: "historico-1", entradaAnteriorId: "entrada-anterior" });
      expect(r.ferramentas).not.toContain("agendar");
      expect(r.rede).toBe(0);
      if (ambiente === "homologacao") expect(r.resposta).toContain("simulação");
    });
  }
});
