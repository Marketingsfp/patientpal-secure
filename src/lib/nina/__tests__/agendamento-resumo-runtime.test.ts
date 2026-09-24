import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("runtime entrega resumo validado e aguarda nova mensagem", () => {
  for (const ambiente of ["producao", "homologacao"])
    for (const cenario of ["sem_pre", "modalidade_indefinida", "confirmado_hora_marcada", "confirmado_chegada_com_pre_agendamento", "confirmado_ficha"])
      test(`${ambiente}: runtime aplica modalidade em ${cenario}`, () => {
        const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
          cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
        });
        expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
        const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        expect(r.requests).toHaveLength(1);
        expect(r.motorChamado).toBe(0);
        expect(r.rede).toBe(0);
        if (cenario === "sem_pre") {
          expect(r.resposta).toContain("sem pré-agendamento");
          expect(r.resposta).not.toMatch(/15|30|antecedência|08:00/);
          expect(r.ferramentas).not.toContain("agendar");
          expect(r.encaminhamentos).toHaveLength(0);
        } else if (cenario === "modalidade_indefinida") {
          expect(r.resposta).toContain("forma de atendimento");
          expect(r.ferramentas).not.toContain("agendar");
          expect(r.encaminhamentos).toHaveLength(1);
        } else {
          expect(r.resposta).toContain("10:20");
          expect(r.resposta).not.toContain("08:00");
          expect(r.ferramentas.filter((f: string) => f === "agendar")).toHaveLength(1);
          expect(r.resposta.includes("30 minutos")).toBe(cenario !== "confirmado_chegada_com_pre_agendamento");
          expect(r.resposta).toContain("Uma hora antes");
          if (cenario === "confirmado_ficha") expect(r.resposta).toContain("*Sua ficha:* 007");
        }
      });
  for (const ambiente of ["producao", "homologacao"])
    for (const cenario of ["escolha_horario", "escolha_sem_auditoria", "escolha_pre", "escolha_ficha", "escolha_cadastro_completo"])
      test(`${ambiente}, ${cenario}: cadastro antes do resumo, sem reservar no lote do modelo`, () => {
        const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
          cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
          stdout: "pipe",
          stderr: "pipe",
          timeout: 15000,
        });
        const output = p.stdout.toString();
        expect(p.exitCode, output + p.stderr.toString()).toBe(0);
        const linha = output.split(/\r?\n/).find((l) => l.startsWith("DIRETA_RESULTADO="));
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        if (cenario.endsWith("cadastro_completo")) expect(r.resposta).toBe(r.resumoEscolhido);
        else {
          expect(r.resposta).toContain("nome completo");
          expect(r.resposta).toContain("data de nascimento");
          expect(r.resposta).not.toContain("Você confirma?");
        }
        expect(r.resposta).not.toContain("08:00");
        expect(r.ferramentas).toContain("selecionar_horario");
        expect(r.ferramentas).toContain("consultar_cadastro_paciente");
        expect(r.ferramentas).not.toContain("agendar");
        expect(r.requests).toHaveLength(1);
        expect(r.motorChamado).toBe(0);
        expect(r.rede).toBe(0);
        expect(r.encaminhamentos).toHaveLength(0);
      });
});
