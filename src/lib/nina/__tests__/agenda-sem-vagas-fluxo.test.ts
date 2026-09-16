import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
function simular(ambiente: string, cenario: string) {
  const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  const output = p.stdout.toString();
  expect(p.exitCode, output + p.stderr.toString()).toBe(0);
  const linha = output.split(/\r?\n/).find((l) => l.startsWith("DIRETA_RESULTADO="));
  expect(linha).toBeDefined();
  return JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
}

describe("geração real interrompe o turno após agenda sem vagas (serviços externos simulados)", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    test(`${ambiente}: encaminha uma vez, informa o motivo e não espera seis rodadas`, () => {
      const r = simular(ambiente, "sem_vagas");
      expect(r.requests).toHaveLength(1);
      expect(r.encaminhamentos).toHaveLength(1);
      expect(r.encaminhamentos[0].motivo).toContain("AGENDA_SEM_VAGAS");
      expect(r.encaminhamentos[0].resumo).toContain("jorge");
      expect(r.resposta).toContain("Não encontrei vagas disponíveis");
      expect(r.resposta).toContain("Encaminhei sua conversa");
      expect(r.ferramentas).not.toContain("agendar");
      expect(r.motorChamado).toBe(0);
      expect(r.rede).toBe(0);
      const evento = r.etapas.find(
        (e: { titulo: string }) => e.titulo === "Encaminhamento por ausência de vagas",
      );
      expect(evento.dados).toMatchObject({
        origem_solicitacao: "servidor",
        handoff_confirmado: true,
      });
      expect(r.finalizacao.resultado.origem).toBe("handoff");
      expect(JSON.stringify(r.encaminhamentos)).not.toContain("LIMITE_RODADAS");
    });
    test(`${ambiente}: transferência que falhou não é anunciada como concluída`, () => {
      const r = simular(ambiente, "falha_handoff");
      expect(r.requests).toHaveLength(1);
      expect(r.encaminhamentos).toHaveLength(1);
      expect(r.resposta).toContain("não consegui transferir");
      expect(r.resposta).not.toContain("Transferido para atendimento humano");
      expect(r.ferramentas).not.toContain("agendar");
    });
    for (const cenario of ["alternativas", "falha_consulta"]) {
      test(`${ambiente}: ${cenario} não dispara transferência por agenda vazia`, () => {
        const r = simular(ambiente, cenario);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.requests).toHaveLength(2);
      });
    }
    test(`${ambiente}: mensagem nova durante a consulta impede transferência do turno antigo`, () => {
      const r = simular(ambiente, "obsoleto");
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.requests).toHaveLength(1);
    });
  }
});
