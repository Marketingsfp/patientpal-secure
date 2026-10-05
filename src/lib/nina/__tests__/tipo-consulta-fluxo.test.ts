import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { REGRA_SELECAO_ATENDIMENTO_CONSULTA } from "../atendimento-consulta";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"])
  test(`${ambiente}: pendência volta ao modelo sem transferência nem reserva`, () => {
    const p = Bun.spawnSync([process.execPath, fixture, ambiente, "tipo_consulta_pendente"], { stdout: "pipe", stderr: "pipe", timeout: 15000 });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
    const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="))!;
    const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
    expect(r.requests).toHaveLength(2);
    expect(r.requests[1].messages.some((m: any) => m.role === "tool" && m.content.includes("ATENDIMENTO_CONSULTA_PENDENTE"))).toBe(true);
    expect(r.requests[0].messages.some((m: any) => m.role === "system" && m.content.includes(REGRA_SELECAO_ATENDIMENTO_CONSULTA))).toBe(true);
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.ferramentas).not.toContain("agendar");
    expect(r.rede).toBe(0);
  });
