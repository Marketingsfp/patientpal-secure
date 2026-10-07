import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import { REGRA_HORARIOS_HABITUAIS_PRIMEIRO, REGRA_SOMENTE_PRIMEIRO_HORARIO } from "../prompt/consulta-agenda";
import { validarTemplateInstrucoes } from "../instrucoes-template";

test("prompt de referência pergunta a preferência antes de listar informações, preservando exceções", () => {
  expect(validarTemplateInstrucoes("whatsapp", PROMPT_NINA_WHATSAPP_V4).ok).toBe(true);
  expect(PROMPT_NINA_WHATSAPP_V4).toContain(REGRA_HORARIOS_HABITUAIS_PRIMEIRO);
  expect(PROMPT_NINA_WHATSAPP_V4).toContain(REGRA_SOMENTE_PRIMEIRO_HORARIO);
  expect(PROMPT_NINA_WHATSAPP_V4).not.toContain("Mais de quatro profissionais: antes de listar");
  expect(PROMPT_NINA_WHATSAPP_V4).not.toContain('Pergunte: "Você prefere a primeira data disponível');
  expect(PROMPT_NINA_WHATSAPP_V4).toContain("sem pré-agendamento");
  expect(PROMPT_NINA_WHATSAPP_V4).toContain("SFP tem prioridade");
  expect(PROMPT_NINA_WHATSAPP_V4).toContain("Você prefere o primeiro horário disponível ou deseja escolher entre os profissionais?");
  expect(PROMPT_NINA_WHATSAPP_V4).toContain("pedido misto de preço e agendamento responde ao preço pedido");
  expect(REGRA_HORARIOS_HABITUAIS_PRIMEIRO).toContain("PERGUNTA SE O ATENDIMENTO EXISTE");
  expect(PROMPT_NINA_WHATSAPP_V4).toContain("perguntar se o atendimento existe não é pedir a lista");
  expect(PROMPT_NINA_WHATSAPP_V4).not.toContain("apresente primeiro os médicos e seus dias/horários habituais");
  expect(PROMPT_NINA_WHATSAPP_V4).not.toContain("Somente depois dessa apresentação");
});

// O modelo é simulado: prova a entrega do contrato ao modelo e a continuidade
// do núcleo, não a interpretação de linguagem natural pelo modelo publicado.
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"])
  for (const cenario of ["escolha_horario", "confirmado_hora_marcada"])
    test(`${ambiente}: regra efetiva chega ao modelo sem bloquear continuação ${cenario}`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], { stdout: "pipe", stderr: "pipe", timeout: 15000 });
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="))!;
      const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
      expect(r.prompt).not.toContain("HORÁRIOS HABITUAIS ANTES DAS VAGAS"); // publicação legada da fixture
      const sistemas = r.requests[0].messages.filter((m: any) => m.role === "system").map((m: any) => m.content).join("\n");
      expect(sistemas).toContain(REGRA_HORARIOS_HABITUAIS_PRIMEIRO);
      expect(sistemas).toContain("ESCOLHA_ANTES_DOS_DETALHES");
      expect(sistemas).toContain(REGRA_SOMENTE_PRIMEIRO_HORARIO);
      expect(r.requests).toHaveLength(1);
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.rede).toBe(0);
      if (cenario === "escolha_horario") {
        expect(r.ferramentas).toContain("selecionar_horario");
        expect(r.ferramentas).not.toContain("agendar");
      } else expect(r.ferramentas.filter((nome: string) => nome === "agendar")).toHaveLength(1);
    });
