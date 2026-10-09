import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));

for (const ambiente of ["producao", "homologacao"])
  it(`${ambiente}: pesquisa ampliada mantém o exame renal já identificado na Base`, () => {
    const p = Bun.spawnSync([process.execPath, fixture, ambiente, "catalogo_continuidade_renal"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20000,
    });
    expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
    const r = JSON.parse(
      p.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("DIRETA_RESULTADO="))!
        .slice("DIRETA_RESULTADO=".length),
    );
    expect(r.rede).toBe(0);
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.resposta).not.toMatch(/pedi.tric|Qual exame/);
    expect(r.estadoPerguntas.knowledge_context.esclarecimento).toBeUndefined();
    const ferramentas = r.requests.at(-1).messages.filter((m: any) => m.role === "tool");
    expect(ferramentas).toHaveLength(3);
    expect(JSON.stringify(ferramentas)).not.toMatch(/pediatrico|IDENTIFICACAO_PENDENTE/);
    expect(r.estadoPerguntas.knowledge_context.referencias).toHaveLength(1);
    expect(r.estadoPerguntas.knowledge_context.referencias[0].registro).toBe("rins");
  });

for (const ambiente of ["producao", "homologacao"])
  for (const caso of ["simples", "independente"])
    it(`${ambiente}: reformulações da densitometria preservam um pedido e uma dúvida (${caso})`, () => {
      const p = Bun.spawnSync(
        [process.execPath, fixture, ambiente, `catalogo_reformulacoes_${caso}`],
        { stdout: "pipe", stderr: "pipe", timeout: 15000 },
      );
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const r = JSON.parse(
        p.stdout
          .toString()
          .split(/\r?\n/)
          .find((l) => l.startsWith("DIRETA_RESULTADO="))!
          .slice("DIRETA_RESULTADO=".length),
      );
      expect(r.rede).toBe(0);
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.resposta).not.toMatch(/180|999|Não encontrei/);
      expect(r.resposta.match(/\?/g)).toHaveLength(1);
      expect(r.resposta).toContain("coluna lombar e colo de fêmur");
      expect(r.resposta).toContain("DUO ENERGETICA");
      expect(r.resposta).not.toContain("CORPO INTEIRO");
      if (caso === "independente") expect(r.resposta).toContain("Antonio atende Psiquiatria");
      const estado = r.estadoPerguntas.knowledge_context;
      expect(estado.consulta.termo).toContain("coluna lombar e colo de fêmur");
      expect(estado.esclarecimentoTentativas).toBe(1);
      expect(estado.pendenciasIdentificacao).toBeUndefined();
      expect(estado.esclarecimento.opcoes).toHaveLength(1);
      const ferramentas = JSON.stringify(
        r.requests.at(-1).messages.filter((m: any) => m.role === "tool"),
      );
      expect(ferramentas).not.toMatch(/180|999/);
      expect(ferramentas).toContain("pendencias_atuais");
      expect(JSON.stringify(r.requests[0].messages)).toContain("reformula_de");
    });
